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
