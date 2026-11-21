import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
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
