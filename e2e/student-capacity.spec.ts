import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Verify quota races against a real local PostgreSQL+PostgREST stack.
 * Preflight HTTP capacity checks are intentionally bypassed; the database
 * itself must serialize all writers, including website/MCP/direct API clients.
 */
test("concurrent hosted student inserts cannot overbook one teacher", async () => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="hosted-cap-"+randomUUID()+"@example.com";
  const password="SyntheticHostedCap-123!";
  const {data:identity,error:identityError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(identityError).toBeNull();
  const id=identity.user!.id;
  const {error:teacherError}=await admin.from("teachers").insert({
    id,email,display_name:"Synthetic quota teacher",hosted_enforced:true,
    hosted_max_active_students:2,hosted_plan:"free",
  });
  expect(teacherError).toBeNull();
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:loginError}=await auth.auth.signInWithPassword({email,password});
  expect(loginError).toBeNull();

  const attempts=await Promise.all(Array.from({length:9},(_,i)=>
    auth.from("students").insert({
      teacher_id:id,name:"Racing student "+i+" "+randomUUID(),
    }).select("id,archived_at").single()
  ));
  const successful=attempts.filter(x=>!x.error).map(x=>x.data!);
  const denied=attempts.filter(x=>x.error);
  expect(successful).toHaveLength(2);
  expect(denied).toHaveLength(7);
  for(const row of denied){
    expect(row.error!.code).toBe("23514");
    expect(row.error!.message).toContain("HOSTED_LIMIT_REACHED");
  }
  const {data:counter,error:counterError}=await admin.from("teachers")
    .select("active_student_count").eq("id",id).single();
  expect(counterError).toBeNull();
  expect(counter!.active_student_count).toBe(2);
  const {count,error:countError}=await admin.from("students")
    .select("id",{count:"exact",head:true}).eq("teacher_id",id).is("archived_at",null);
  expect(countError).toBeNull();
  expect(count).toBe(2);

  // Direct authenticated or privileged edits must not bypass the reviewed
  // lifecycle transaction (or its atomically serialized active-student cap).
  const directArchive=await auth.from("students").update({
    archived_at:new Date().toISOString(),
  }).eq("id",successful[0].id);
  expect(directArchive.error?.message).toContain("USE_REVIEWED_STUDENT_LIFECYCLE");
  const privilegedArchive=await admin.from("students").update({
    archived_at:new Date().toISOString(),
  }).eq("id",successful[0].id);
  expect(privilegedArchive.error?.message).toContain("USE_REVIEWED_STUDENT_LIFECYCLE");
  const lifecycle=async(studentId:string,mode:"archive"|"reactivate")=>{
    const preview=await auth.rpc("ccp_student_lifecycle_preview",{p_student_id:studentId});
    expect(preview.error).toBeNull();
    return auth.rpc("ccp_student_lifecycle_commit",{
      p_student_id:studentId,p_mode:mode,
      p_expected_updated_at:preview.data.expectedUpdatedAt,
      p_selected_workplaces:[],p_request_id:randomUUID(),
      p_reason:"Synthetic teacher reviewed hosted capacity lifecycle",
      p_confirmed:true,
    });
  };
  const archived=await lifecycle(successful[0].id,"archive");
  expect(archived.error).toBeNull();
  const third=await auth.from("students").insert({teacher_id:id,
    name:"Third student "+randomUUID()}).select("id").single();
  expect(third.error).toBeNull();
  const blockedReturn=await lifecycle(successful[0].id,"reactivate");
  expect(blockedReturn.error?.code).toBe("23514");
  const archivedThird=await lifecycle(third.data!.id,"archive");
  expect(archivedThird.error).toBeNull();
  const allowedReturn=await lifecycle(successful[0].id,"reactivate");
  expect(allowedReturn.error).toBeNull();

  // Authenticated teachers cannot increase their own hosted capacity.
  const spoof=await auth.from("teachers").update({
    hosted_enforced:false,hosted_max_active_students:100000,
    active_student_count:0,
  }).eq("id",id);
  expect(spoof.error).not.toBeNull();
  const {data:stillProtected}=await admin.from("teachers")
    .select("hosted_enforced,hosted_max_active_students,active_student_count")
    .eq("id",id).single();
  expect(stillProtected).toEqual({
    hosted_enforced:true,hosted_max_active_students:2,active_student_count:2,
  });
  const {error:deleteUserError}=await admin.auth.admin.deleteUser(id);
  expect(deleteUserError).toBeNull();
});

test("unmetered self-hosted teacher is not subjected to hosted cap", async () => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="selfhost-cap-"+randomUUID()+"@example.com";
  const password="SyntheticSelfHosted-123!";
  const {data:identity,error:identityError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(identityError).toBeNull();
  const id=identity.user!.id;
  expect((await admin.from("teachers").insert({
    id,email,display_name:"Unmetered test",hosted_enforced:false,
    hosted_max_active_students:1,hosted_plan:"free",
  })).error).toBeNull();
  const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  for(let i=0;i<4;i++){
    const created=await auth.from("students").insert({
      teacher_id:id,name:"Self-host learner "+randomUUID(),
    }).select("id").single();
    expect(created.error).toBeNull();
  }
  const {data:counter}=await admin.from("teachers")
    .select("active_student_count").eq("id",id).single();
  expect(counter?.active_student_count).toBe(4);
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});


test("new hosted trial teacher cannot bypass free cap after trial expires",async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="hosted-origin-"+randomUUID()+"@example.com";
  const password="SyntheticOrigin-123!";
  const {data:user,error:userError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(userError).toBeNull();
  const id=user.user!.id;
  const {error:createError}=await admin.from("teachers").insert({
    id,email,display_name:"Hosted origin protection",
    hosted_plan:"trial",trial_ends_at:"2020-01-01T00:00:00Z",
    hosted_max_active_students:1,
    // hosted_enforced intentionally omitted: production signup default.
  });
  expect(createError).toBeNull();
  const {data:teacher,error:fetchError}=await admin.from("teachers")
    .select("hosted_enforced,hosted_plan,active_student_count")
    .eq("id",id).single();
  expect(fetchError).toBeNull();
  expect(teacher).toMatchObject({
    hosted_enforced:true,hosted_plan:"trial",active_student_count:0,
  });
  const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  const attempts=await Promise.all([0,1,2,3].map(i=>auth.from("students")
    .insert({teacher_id:id,name:"Origin learner "+i+" "+randomUUID()})
    .select("id").single()));
  expect(attempts.filter(x=>!x.error)).toHaveLength(1);
  expect(attempts.filter(x=>x.error?.message.includes("HOSTED_LIMIT_REACHED")))
    .toHaveLength(3);
  const {data:counter}=await admin.from("teachers").select("active_student_count")
    .eq("id",id).single();
  expect(counter?.active_student_count).toBe(1);
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});


test("archived lesson recovery serializes simultaneous hosted-capacity reactivations",async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const email="archived-recovery-cap-"+randomUUID()+"@example.com";
  const password="SyntheticRecoveryCap-123!";
  const {data:identity,error:identityError}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
  });
  expect(identityError).toBeNull();
  const teacherId=identity.user!.id;
  try{
    const teacherInsert=await admin.from("teachers").insert({
      id:teacherId,email,display_name:"Archived recovery quota test",
      hosted_enforced:true,hosted_max_active_students:2,hosted_plan:"free",
    });
    expect(teacherInsert.error).toBeNull();
    const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
    const campus=await admin.from("workplaces").insert({
      teacher_id:teacherId,name:"Archived recovery campus "+randomUUID(),
      timezone:"UTC",currency:"USD",locale:"en",policy:{},
    }).select("id").single();
    expect(campus.error).toBeNull();
    const workplaceId=campus.data!.id as string;
    const archivedIds:string[]=[];
    const revisions:string[]=[];
    for(let i=0;i<2;i++){
      const created=await auth.from("students").insert({
        teacher_id:teacherId,name:"Returning learner "+i+" "+randomUUID(),
      }).select("id").single();
      expect(created.error).toBeNull();
      const studentId=created.data!.id as string;
      expect((await admin.from("workplace_enrollments").insert({
        teacher_id:teacherId,workplace_id:workplaceId,
        student_id:studentId,source:"manual",
      })).error).toBeNull();
      const preview=await auth.rpc("ccp_student_lifecycle_preview",{
        p_student_id:studentId,
      });
      expect(preview.error).toBeNull();
      expect(preview.data.canArchive).toBe(true);
      const archive=await auth.rpc("ccp_student_lifecycle_commit",{
        p_student_id:studentId,p_mode:"archive",
        p_expected_updated_at:preview.data.expectedUpdatedAt,
        p_selected_workplaces:[],p_request_id:randomUUID(),
        p_reason:"Teacher reviewed archival before a quota race test",
        p_confirmed:true,
      });
      expect(archive.error).toBeNull();
      expect(archive.data.archived).toBe(true);
      const archived=await auth.rpc("ccp_student_lifecycle_preview",{
        p_student_id:studentId,
      });
      expect(archived.error).toBeNull();
      expect(archived.data.previousWorkplaceIds).toContain(workplaceId);
      archivedIds.push(studentId);
      revisions.push(archived.data.expectedUpdatedAt as string);
    }
    // Only one active slot remains. Neither participant can obtain it by
    // racing another approved, individually valid lesson+reactivation.
    const active=await auth.from("students").insert({
      teacher_id:teacherId,name:"Currently active learner "+randomUUID(),
    }).select("id").single();
    expect(active.error).toBeNull();
    const approvals=archivedIds.map((studentId,i)=>({
      p_workplace_id:workplaceId,p_student_ids:[studentId],
      p_reactivations:[{studentId,expectedUpdatedAt:revisions[i]}],
      p_title:"Concurrent archived return "+i+" "+randomUUID(),
      p_starts_at:i===0?"2060-03-10T14:00:00+00:00":"2060-03-11T14:00:00+00:00",
      p_duration_minutes:45,p_lesson_note:"",
      p_request_id:randomUUID(),
      p_reason:"Teacher explicitly approves one safe returning learner",
      p_confirmed:true,
    }));
    const attempts=await Promise.all(approvals.map(args=>
      auth.rpc("ccp_teacher_archived_lesson_recovery_commit",args)));
    const successes=attempts.filter(x=>!x.error);
    const rejected=attempts.filter(x=>x.error);
    expect(successes).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].error!.code).toBe("23514");
    expect(rejected[0].error!.message).toContain("HOSTED_LIMIT_REACHED");
    const {data:teacher,error:teacherError}=await admin.from("teachers")
      .select("active_student_count").eq("id",teacherId).single();
    expect(teacherError).toBeNull();
    expect(teacher?.active_student_count).toBe(2);
    const {data:students,error:studentError}=await admin.from("students")
      .select("id,archived_at").eq("teacher_id",teacherId);
    expect(studentError).toBeNull();
    expect(students!.filter(s=>s.archived_at===null)).toHaveLength(2);
    expect(students!.filter(s=>s.archived_at!==null)).toHaveLength(1);
    const {data:sessions,error:sessionError}=await admin.from("teaching_sessions")
      .select("id,student_id").eq("teacher_id",teacherId);
    expect(sessionError).toBeNull();
    expect(sessions).toHaveLength(1);
    const winner=successes[0].data;
    expect(sessions![0].id).toBe(winner.id);
    expect(winner.reactivatedCount).toBe(1);
    const winningArgs=approvals[attempts.findIndex(x=>!x.error)];
    const replay=await auth.rpc("ccp_teacher_archived_lesson_recovery_commit",winningArgs);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({id:winner.id,replayed:true});
    const {count,error:sessionCountError}=await admin.from("teaching_sessions")
      .select("id",{count:"exact",head:true}).eq("teacher_id",teacherId);
    expect(sessionCountError).toBeNull();
    expect(count).toBe(1);
  }finally{
    expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }
});
