import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

/** SQL is the capacity authority for website, MCP, direct writes and imports. */
test("concurrent student inserts cannot overbook an explicitly capped tenant",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="sql-cap-"+randomUUID()+"@example.com";
 const password="SyntheticSqlCap-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 const teacher=await admin.from("teachers").insert({
  id,email,display_name:"Synthetic capacity teacher",
 });
 expect(teacher.error).toBeNull();
 const cap=await configureSyntheticStudentCapacity(admin,id,2);
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();

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
  expect(row.error!.message).toContain("CAPACITY_EXCEEDED");
 }
 const readCounter=async()=>admin.from("teacher_entitlement_state")
  .select("active_student_count,baseline_plan_version_id").eq("teacher_id",id).single();
 const count=await readCounter();
 expect(count.error).toBeNull();
 expect(count.data).toEqual({
  active_student_count:2,baseline_plan_version_id:cap.planId,
 });
 const {count:actual,error:actualError}=await admin.from("students")
  .select("id",{count:"exact",head:true}).eq("teacher_id",id).is("archived_at",null);
 expect(actualError).toBeNull();
 expect(actual).toBe(2);

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
   p_reason:"Synthetic teacher reviewed capacity and lifecycle",
   p_confirmed:true,
  });
 };
 const archived=await lifecycle(successful[0].id,"archive");
 expect(archived.error).toBeNull();
 const third=await auth.from("students").insert({
  teacher_id:id,name:"Third student "+randomUUID(),
 }).select("id").single();
 expect(third.error).toBeNull();
 const blocked=await lifecycle(successful[0].id,"reactivate");
 expect(blocked.error?.code).toBe("23514");
 expect(blocked.error?.message).toContain("CAPACITY_EXCEEDED");
 expect((await lifecycle(third.data!.id,"archive")).error).toBeNull();
 expect((await lifecycle(successful[0].id,"reactivate")).error).toBeNull();

 // A teacher cannot forge a higher cap or counters through authenticated JWT.
 const spoof=await auth.from("teacher_entitlement_state").update({
  active_student_count:0,baseline_plan_version_id:null,
 }).eq("teacher_id",id);
 expect(spoof.error).not.toBeNull();
 const remaining=await readCounter();
 expect(remaining.error).toBeNull();
 expect(remaining.data).toEqual({active_student_count:2,baseline_plan_version_id:cap.planId});
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("default fresh-install Free tenant has no unapproved cap",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="unlimited-default-"+randomUUID()+"@example.com";
 const password="SyntheticUnlimited-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Default entitlement test",
 })).error).toBeNull();
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const cap=await auth.rpc("ccp_entitlement_summary");
 expect(cap.error).toBeNull();
 expect(cap.data.studentCapacity.unlimited).toBe(true);
 for(let i=0;i<4;i++){
  const created=await auth.from("students").insert({
   teacher_id:id,name:"Default learner "+randomUUID(),
  }).select("id").single();
  expect(created.error).toBeNull();
 }
 const state=await admin.from("teacher_entitlement_state")
  .select("active_student_count").eq("teacher_id",id).single();
 expect(state.error).toBeNull();
 expect(state.data?.active_student_count).toBe(4);
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("expired Pro plan grant cannot bypass a capped baseline",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="expired-grant-"+randomUUID()+"@example.com";
 const password="SyntheticExpired-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Expired grant capacity protection",
 })).error).toBeNull();
 const base=await configureSyntheticStudentCapacity(admin,id,1);
 const pro=await admin.from("plan_versions").select("id")
  .eq("code","pro").eq("version",1).single();
 expect(pro.error).toBeNull();
 const expired=await admin.from("teacher_entitlement_grants").insert({
  teacher_id:id,kind:"plan_access",plan_version_id:pro.data!.id,
  valid_from:"2019-01-01T00:00:00Z",expires_at:"2020-01-01T00:00:00Z",
  reason:"Synthetic expired temporary Pro allowance",request_id:randomUUID(),
 });
 expect(expired.error).toBeNull();
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const summary=await auth.rpc("ccp_entitlement_summary");
 expect(summary.error).toBeNull();
 expect(summary.data.studentCapacity.limit).toBe(1);
 expect(summary.data.studentCapacity.planVersionId).toBe(base.planId);
 const attempts=await Promise.all([0,1,2,3].map(i=>auth.from("students")
  .insert({teacher_id:id,name:"Grant expired learner "+i+" "+randomUUID()})
  .select("id").single()));
 expect(attempts.filter(x=>!x.error)).toHaveLength(1);
 expect(attempts.filter(x=>x.error?.message.includes("CAPACITY_EXCEEDED")))
  .toHaveLength(3);
 const state=await admin.from("teacher_entitlement_state")
  .select("active_student_count").eq("teacher_id",id).single();
 expect(state.data?.active_student_count).toBe(1);
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});


test("individual capacity boosts are additive, expirable, revocable and never self-issued",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="boost-cap-"+randomUUID()+"@example.com";
 const password="SyntheticBoost-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Synthetic boost tenant",
 })).error).toBeNull();
 const baseline=await configureSyntheticStudentCapacity(admin,id,1);
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const summary=async()=>{
  const result=await auth.rpc("ccp_entitlement_summary");
  expect(result.error).toBeNull();
  return result.data.studentCapacity;
 };
 expect((await summary()).limit).toBe(1);
 const selfIssued=await auth.from("teacher_entitlement_grants").insert({
  teacher_id:id,kind:"capability_boost",capability_key:"students.active",
  capability_kind:"integer_limit",integer_value:100,unlimited:false,
  reason:"Unauthorized synthetic self grant",request_id:randomUUID(),
 });
 expect(selfIssued.error).not.toBeNull();
 const expired=await admin.from("teacher_entitlement_grants").insert({
  teacher_id:id,kind:"capability_boost",capability_key:"students.active",
  capability_kind:"integer_limit",integer_value:10,unlimited:false,
  valid_from:"2019-01-01T00:00:00Z",expires_at:"2020-01-01T00:00:00Z",
  reason:"Expired synthetic capacity boost",request_id:randomUUID(),
 });
 expect(expired.error).toBeNull();
 expect((await summary()).limit).toBe(1);
 const granted=await admin.from("teacher_entitlement_grants").insert({
  teacher_id:id,kind:"capability_boost",capability_key:"students.active",
  capability_kind:"integer_limit",integer_value:3,unlimited:false,
  reason:"Temporary synthetic active roster boost",request_id:randomUUID(),
 }).select("id").single();
 expect(granted.error).toBeNull();
 expect((await summary()).limit).toBe(3);
 const created=await Promise.all(Array.from({length:4},(_,i)=>
  auth.from("students").insert({teacher_id:id,name:"Boost student "+i+" "+randomUUID()})
   .select("id").single()));
 expect(created.filter(x=>!x.error)).toHaveLength(3);
 expect(created.filter(x=>x.error?.message.includes("CAPACITY_EXCEEDED")))
  .toHaveLength(1);
 const revoked=await admin.from("teacher_entitlement_grants")
  .update({revoked_at:new Date().toISOString()}).eq("id",granted.data!.id);
 expect(revoked.error).toBeNull();
 expect((await summary()).limit).toBe(1);
 const denied=await auth.from("students").insert({
  teacher_id:id,name:"Post-revocation "+randomUUID(),
 });
 expect(denied.error?.message).toContain("CAPACITY_EXCEEDED");
 const state=await admin.from("teacher_entitlement_state")
  .select("active_student_count").eq("teacher_id",id).single();
 expect(state.error).toBeNull();
 expect(state.data?.active_student_count).toBe(3);
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});


test("PARITY:PARITY-zero SQL student capacity matches the roster and MCP and rejects writes",async({page,request})=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="zero-cap-"+randomUUID()+"@example.com";
 const password="SyntheticZero-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id,email,display_name:"Zero-cap tenant",onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,0);
  const call=await delegatedTool(page,request,"coach:read",{email,password});
  const tool=await call("ccp_hosted_subscription_handoff",{});
  expect(tool.error).toBeUndefined();
  expect(tool.data.entitlements).toMatchObject({
   activeStudentCount:0,studentCapacity:{limit:0,unlimited:false},
  });
  await page.goto("/students");
  await expect(page.getByRole("status").filter({hasText:"Active students: 0 / 0"})).toBeVisible();
  const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  const results=await Promise.all(Array.from({length:3},(_,i)=>
   auth.from("students").insert({
    teacher_id:id,name:"Rejected at zero "+i+" "+randomUUID(),
   })));
  for(const result of results){
   expect(result.error?.code).toBe("23514");
   expect(result.error?.message).toContain("CAPACITY_EXCEEDED");
  }
  const state=await admin.from("teacher_entitlement_state")
   .select("active_student_count").eq("teacher_id",id).single();
  expect(state.error).toBeNull();
  expect(state.data?.active_student_count).toBe(0);
  const actual=await admin.from("students")
   .select("id",{count:"exact",head:true}).eq("teacher_id",id);
  expect(actual.error).toBeNull();
  expect(actual.count).toBe(0);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

test("archived lesson recovery serializes concurrent capacity reactivations using canonical entitlements",async()=>{
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
    });
    expect(teacherInsert.error).toBeNull();
    await configureSyntheticStudentCapacity(admin,teacherId,2);
    const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
    const campus=await admin.from("workplaces").insert({
      teacher_id:teacherId,name:"Archived recovery campus "+randomUUID(),
      timezone:"UTC",currency:"USD",locale:"en",policy:{},kind:"professional",
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
    // Only one active slot remains in the canonical tenant quota. Neither participant can obtain it by
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
    expect(rejected[0].error!.message).toContain("CAPACITY_EXCEEDED");
    const {data:state,error:stateError}=await admin.from("teacher_entitlement_state")
      .select("active_student_count").eq("teacher_id",teacherId).single();
    expect(stateError).toBeNull();
    expect(state?.active_student_count).toBe(2);
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

