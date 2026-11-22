import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createServerClient} from "@supabase/ssr";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
const syntheticAdmin=()=>createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
async function fixture(admin:SupabaseClient){
 const email=`group-schema-${randomUUID()}@example.com`;
 const password="SyntheticGroupEvidence123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Synthetic group acceptance teacher",
 })).error).toBeNull();
 const cookieJar=new Map<string,string>();
 const browserSession=createServerClient(url,anon,{cookies:{
  getAll:()=>[...cookieJar].map(([name,value])=>({name,value})),
  setAll:items=>{
   for(const {name,value} of items){
    if(value)cookieJar.set(name,value);else cookieJar.delete(name);
   }
  },
 }});
 const login=await browserSession.auth.signInWithPassword({email,password});
 expect(login.error).toBeNull();
 const cookie=[...cookieJar].map(([k,v])=>k+"="+v).join("; ");
 expect(cookie.length).toBeGreaterThan(0);
 const owner=createClient(url,anon,options);
 expect((await owner.auth.signInWithPassword({email,password})).error).toBeNull();
 const workplace=await admin.from("workplaces").select("id")
  .eq("teacher_id",id).eq("kind","personal").single();
 expect(workplace.error).toBeNull();
 return {id,owner,personalId:workplace.data!.id as string,cookie,accessToken:login.data.session!.access_token};
}

const mutation=(db:SupabaseClient,operation:string,payload:Record<string,unknown>)=>
 db.rpc("agent_coaching_mutate",{
  p_operation:operation,p_payload:payload,p_expected_updated_at:null,
  p_idempotency_key:randomUUID(),p_client_id:"synthetic group source acceptance",
 });

/** ENT-07: memberships do not create new active-student capacity units. */
test("one active student uses one quota across multiple groups and workplaces",async()=>{
 const admin=syntheticAdmin();
 const {id,owner,personalId}=await fixture(admin);
 try{
  const cap=await configureSyntheticStudentCapacity(admin,id,1,1);
  const student=await owner.from("students").insert({
   teacher_id:id,name:"Learner sharing groups and workplaces",
  }).select("id").single();
  expect(student.error).toBeNull();
  const learnerId=student.data!.id;
  const professional=await owner.from("workplaces").insert({
   teacher_id:id,name:"Synthetic professional group workplace",kind:"professional",
   timezone:"UTC",currency:"USD",locale:"en",policy:{},
  }).select("id").single();
  expect(professional.error).toBeNull();
  const professionalId=professional.data!.id;
  const groupWorkplaces=[personalId,personalId,professionalId];
  const made=await owner.from("class_groups").insert(groupWorkplaces.map((workplaceId,index)=>({
   teacher_id:id,workplace_id:workplaceId,name:"Synthetic group "+index,
  }))).select("id,workplace_id");
  expect(made.error).toBeNull();
  expect(made.data).toHaveLength(3);
  for(const group of made.data!){
   const enrolled=await mutation(owner,"groups.enroll",{groupId:group.id,studentId:learnerId});
   expect(enrolled.error).toBeNull();
  }
  const memberships=await owner.from("group_enrollments").select("group_id,student_id,workplace_id")
   .eq("teacher_id",id);
  expect(memberships.error).toBeNull();
  expect(memberships.data).toHaveLength(3);
  expect(memberships.data).toEqual(expect.arrayContaining(made.data!.map(group=>({
   group_id:group.id,student_id:learnerId,workplace_id:group.workplace_id,
  }))));
  const enrollments=await owner.from("workplace_enrollments").select("workplace_id,student_id")
   .eq("teacher_id",id).is("cancelled_at",null);
  expect(enrollments.error).toBeNull();
  expect(enrollments.data).toHaveLength(2);
  expect(enrollments.data).toEqual(expect.arrayContaining([personalId,professionalId].map(workplaceId=>({
   workplace_id:workplaceId,student_id:learnerId,
  }))));
  const atLimit=await owner.rpc("ccp_entitlement_summary");
  expect(atLimit.error).toBeNull();
  expect(atLimit.data).toMatchObject({
   activeStudentCount:1,activeProfessionalWorkplaceCount:1,
   studentCapacity:{planVersionId:cap.planId,enabled:true,unlimited:false,limit:1},
  });
  const denied=await owner.from("students").insert({teacher_id:id,name:"A second active student"});
  expect(denied.error).toMatchObject({code:"23514",message:"CAPACITY_EXCEEDED"});
  const after=await admin.from("students").select("id").eq("teacher_id",id).is("archived_at",null);
  const counter=await admin.from("teacher_entitlement_state").select("active_student_count")
   .eq("teacher_id",id).single();
  expect(after.error).toBeNull();
  expect(counter.error).toBeNull();
  expect(after.data).toEqual([{id:learnerId}]);
  expect(counter.data).toEqual({active_student_count:1});
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

/** TCH-05: a real teacher-attested group observation is individual evidence. */
test("group learning observation verifies only the individually selected learner",async({request})=>{
 const admin=syntheticAdmin();
 const {id,owner,personalId,cookie,accessToken}=await fixture(admin);
 try{
  const students=await owner.from("students").insert([
   {teacher_id:id,name:"Individually observed pupil"},
   {teacher_id:id,name:"Other attending pupil"},
   {teacher_id:id,name:"Owned pupil outside the frozen group"},
  ]).select("id");
  expect(students.error).toBeNull();
  expect(students.data).toHaveLength(3);
  const [selected,unselected,nonmember]=students.data!;
  const group=await owner.from("class_groups").insert({
   teacher_id:id,workplace_id:personalId,name:"Actual two-learner fixture group",
  }).select("id").single();
  expect(group.error).toBeNull();
  for(const studentId of [selected.id,unselected.id]){
   const enrolled=await mutation(owner,"groups.enroll",{groupId:group.data!.id,studentId});
   expect(enrolled.error).toBeNull();
  }
  const created=await mutation(owner,"sessions.create",{
   groupId:group.data!.id,workplaceId:personalId,title:"Synthetic group learning fixture",
   startsAt:new Date(Date.now()-2*3600000).toISOString(),durationMinutes:45,
  });
  expect(created.error).toBeNull();
  const sessionId=created.data.entityId as string;
  const roster=await owner.from("session_participants").select("student_id").eq("session_id",sessionId);
  expect(roster.error).toBeNull();
  expect(roster.data).toHaveLength(2);
  expect(roster.data).toEqual(expect.arrayContaining([
   {student_id:selected.id},{student_id:unselected.id},
  ]));
  const completed=await owner.rpc("ccp_teacher_session_commit",{
   p_session_id:sessionId,p_changes:{status:"completed"},p_expected_updated_at:created.data.revision,
   p_attendance:[selected.id,unselected.id].map(studentId=>({
    studentId,status:"present",note:"Explicitly attended group lesson",expectedUpdatedAt:null,
   })),p_idempotency_key:randomUUID(),
  });
  expect(completed.error).toBeNull();
  expect(completed.data.attendance).toEqual(expect.arrayContaining([
   expect.objectContaining({studentId:selected.id,status:"present"}),
   expect.objectContaining({studentId:unselected.id,status:"present"}),
  ]));
  const closed=await owner.from("teaching_sessions").select("status,group_id").eq("id",sessionId).single();
  expect(closed.error).toBeNull();
  expect(closed.data).toEqual({status:"completed",group_id:group.data!.id});
  const category=await owner.from("chess_skill_categories").insert({
   teacher_id:id,name:"Synthetic tactical observation category",
  }).select("id").single();
  expect(category.error).toBeNull();
  const post=(data:Record<string,unknown>,headers:Record<string,string>={Cookie:cookie})=>
   request.post("/api/agent/v1",{data,headers});
  const write={
   action:"chess.observations.create",studentId:selected.id,sessionId,categoryId:category.data!.id,
   observation:"Individually found the forcing move only after a hint",requestId:randomUUID(),
  };
  const deniedBearer=await post(write,{Authorization:"Bearer "+accessToken});
  expect(deniedBearer.status(),await deniedBearer.text()).toBe(403);
  expect((await deniedBearer.json()).error.code).toBe("BROWSER_APPROVAL_REQUIRED");
  const deniedNonmember=await post({...write,studentId:nonmember.id,requestId:randomUUID()});
  expect(deniedNonmember.status(),await deniedNonmember.text()).toBe(404);
  expect((await deniedNonmember.json()).error.code).toBe("NOT_FOUND");

  const verified=await post(write);
  expect(verified.status(),await verified.text()).toBe(201);
  const {data:issued}=await verified.json();
  expect(issued).toMatchObject({
   student_id:selected.id,session_id:sessionId,category_id:category.data!.id,source:"teacher",
   verified_at:expect.any(String),verified_by:id,
  });
  const selectedRead=await post({action:"chess.observations.list",studentId:selected.id,sessionId});
  const otherRead=await post({action:"chess.observations.list",studentId:unselected.id,sessionId});
  expect(selectedRead.status(),await selectedRead.text()).toBe(200);
  expect(otherRead.status(),await otherRead.text()).toBe(200);
  expect((await selectedRead.json()).data).toEqual([expect.objectContaining({
   id:issued.id,student_id:selected.id,verified_at:issued.verified_at,
  })]);
  expect((await otherRead.json()).data).toEqual([]);
  const persisted=await owner.from("chess_observations")
   .select("id,student_id,learning_stage,verified_by").eq("session_id",sessionId);
  expect(persisted.error).toBeNull();
  expect(persisted.data).toEqual([{id:issued.id,student_id:selected.id,learning_stage:null,verified_by:id}]);
  const otherSkill=await owner.from("skill_assessments").select("id").eq("student_id",unselected.id);
  const otherMaterial=await owner.from("material_teaching_evidence").select("id")
   .eq("student_id",unselected.id).eq("session_id",sessionId);
  expect(otherSkill.error).toBeNull();
  expect(otherMaterial.error).toBeNull();
  expect(otherSkill.data).toEqual([]);
  expect(otherMaterial.data).toEqual([]);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
