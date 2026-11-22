import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

const options={auth:{persistSession:false,autoRefreshToken:false}};
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const password="SyntheticFreePersonal123!";
async function freshTeacher(){
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
  const email="personal-workplace-"+randomUUID()+"@example.invalid";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  const teacherId=identity.data.user!.id;
  const profile=await admin.from("teachers").insert({id:teacherId,email,display_name:"Personal coaching",
    preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()});
  expect(profile.error).toBeNull();
  return {admin,teacherId,email,password,cleanup:async()=>{
    expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
  }};
}

test("PARITY: a default-Free Personal group teaches existing learners without creating workplace or finance rights",async({page,request})=>{
  const {admin,teacherId,email,cleanup}=await freshTeacher();
  try{
    const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
    const readLocations=()=>admin.from("workplaces").select("id,kind").eq("teacher_id",teacherId);
    const locations=await readLocations();
    expect(locations.error).toBeNull();
    expect(locations.data).toEqual([{id:expect.any(String),kind:"personal"}]);
    const workplaceId=locations.data![0].id as string;
    const studentIds:string[]=[];
    for(const name of ["Existing Personal learner A","Existing Personal learner B"]){
      const learner=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
      expect(learner.error).toBeUndefined();
      const studentId=learner.data.entityId as string;
      studentIds.push(studentId);
      expect((await call("ccp_workplaces_enroll",{workplaceId,studentId,idempotencyKey:randomUUID()})).error)
        .toBeUndefined();
    }
    const before=await call("ccp_hosted_subscription_handoff",{});
    expect(before.error).toBeUndefined();
    expect(before.data.entitlements).toMatchObject({
      activeStudentCount:2,activeProfessionalWorkplaceCount:0,
      workplaceCapacity:{planCode:"free"},reportPublishing:{planCode:"free",enabled:false},
    });
    const compensation=await call("ccp_compensation_agreements_list",{workplaceId});
    expect(compensation.error).toBeUndefined();
    const group=await call("ccp_groups_create",{workplaceId,name:"Personal sibling group",idempotencyKey:randomUUID()});
    expect(group.error).toBeUndefined();
    const groupId=group.data.entityId as string;
    for(const studentId of studentIds)
      expect((await call("ccp_groups_enroll",{groupId,studentId,idempotencyKey:randomUUID()})).error).toBeUndefined();
    const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const lesson=await call("ccp_sessions_create",{workplaceId,groupId,title:"Personal opposition class",
      startsAt:date+"T14:00:00Z",durationMinutes:45,idempotencyKey:randomUUID()});
    expect(lesson.error).toBeUndefined();
    const sessionId=lesson.data.entityId as string;
    const detail=await call("ccp_sessions_details",{sessionId});
    const attendance=await call("ccp_attendance_preview",{sessionId});
    expect(detail.error).toBeUndefined();
    expect(attendance.error).toBeUndefined();
    expect(attendance.data.attendance.map((row:{student_id:string})=>row.student_id).sort())
      .toEqual([...studentIds].sort());
    const complete=await page.request.post("/api/agent/v1",{data:{
      action:"sessions.complete",sessionId,expectedUpdatedAt:detail.data.updated_at,confirmed:true,
      idempotencyKey:randomUUID(),lessonNote:"Reviewed Personal group lesson",
      attendance:attendance.data.attendance.map((row:{student_id:string;updated_at:string|null})=>({
        studentId:row.student_id,status:"present",expectedUpdatedAt:row.updated_at,note:"Attended",
      })),
    }});
    expect(complete.status(),await complete.text()).toBe(200);
    expect((await call("ccp_sessions_details",{sessionId})).data).toMatchObject({status:"completed"});
    const recorded=await call("ccp_attendance_preview",{sessionId});
    expect(recorded.error).toBeUndefined();
    expect(recorded.data.attendance.map((row:{status:string})=>row.status)).toEqual(["present","present"]);
    const material=await call("ccp_learning_materials_create",{
      kind:"study_chapter",title:"Opposition",description:"",sourceUrl:"https://lichess.org/study/AbCd1234",
      details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},requestId:randomUUID(),
    });
    expect(material.error).toBeUndefined();
    const approved=await call("ccp_materials_history_record",{
      studentId:studentIds[0],materialId:material.data.material.id,sessionId,workplaceId,
      occurredOn:date,stage:"taught",note:"Teacher explicitly recorded material",confirmed:true,requestId:randomUUID(),
    });
    expect(approved.error).toBeUndefined();
    const filter={studentId:studentIds[0],from:date,to:date};
    const browser=await page.request.get("/api/coaching/materials?"+new URLSearchParams(filter));
    expect(browser.status(),await browser.text()).toBe(200);
    expect((await call("ccp_materials_history_list",filter)).data).toEqual(await browser.json());
    expect((await browser.json()).entries).toEqual([expect.objectContaining({id:approved.data.id,stage:"taught"})]);
    expect((await call("ccp_materials_history_list",{...filter,studentId:studentIds[1]})).data.total).toBe(0);

    const after=await call("ccp_hosted_subscription_handoff",{});
    expect(after.error).toBeUndefined();
    const policy=(value:typeof before.data.entitlements)=>{
      const cap=(entry:Record<string,unknown>)=>Object.fromEntries(Object.entries(entry)
        .filter(([key])=>key!=="evaluatedAt"));
      return {revision:value.revision,activeStudentCount:value.activeStudentCount,
        activeProfessionalWorkplaceCount:value.activeProfessionalWorkplaceCount,
        workplaceCapacity:cap(value.workplaceCapacity),reportPublishing:cap(value.reportPublishing)};
    };
    expect(policy(after.data.entitlements)).toEqual(policy(before.data.entitlements));
    expect(await call("ccp_compensation_agreements_list",{workplaceId})).toEqual(compensation);
    const endLocations=await readLocations();
    expect(endLocations.error).toBeNull();
    expect(endLocations.data).toEqual(locations.data);
    for(const table of ["billing_accounts","compensation_agreements","financial_obligations"]){
      const result=await admin.from(table).select("id").eq("teacher_id",teacherId);
      expect(result.error,table).toBeNull();
      expect(result.data,table+" not granted or created by group").toEqual([]);
    }
  }finally{await cleanup();}
});

test("PARITY: signed owner deletion of an empty selected workplace falls back to All in browser and MCP",async({page,request})=>{
  const {admin,teacherId,email,cleanup}=await freshTeacher();
  try{
    const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
    const created=await call("ccp_workplaces_create",{name:"Empty disposable scope",timezone:"UTC",
      currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID()});
    expect(created.error).toBeUndefined();
    const id=created.data.entityId as string;
    expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:id,
      expectedSelectedWorkplaceId:null,confirmed:true})).data.selectedWorkplaceId).toBe(id);
    // Use the real teacher JWT rather than a privileged service deletion.
    const signed=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    expect((await signed.auth.signInWithPassword({email,password})).error).toBeNull();
    const deleted=await signed.from("workplaces").delete().eq("id",id).eq("teacher_id",teacherId).select("id");
    expect(deleted.error).toBeNull();
    expect(deleted.data).toEqual([{id}]);
    const stored=await admin.from("teachers").select("selected_workplace_id").eq("id",teacherId).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.selected_workplace_id).toBeNull();
    const browser=await page.request.get("/api/teacher/workplace-context");
    expect(browser.status(),await browser.text()).toBe(200);
    const mcp=await call("ccp_workplace_context_get",{});
    expect(mcp.error).toBeUndefined();
    expect(await browser.json()).toEqual(mcp.data);
    expect(mcp.data).toMatchObject({selectedWorkplaceId:null,selectedWorkplace:null,
      selectionWasStale:false,workplaces:[{id:expect.any(String)}]});
    expect(mcp.data.workplaces[0].id).not.toBe(id);
    await page.goto("/dashboard");
    await expect(page.locator("#global-workplace-switch")).toHaveValue("all");
    expect((await call("ccp_dashboard_summary",{})).data).toMatchObject({workplaceId:null,scopedWorkplaceCount:1});
  }finally{await cleanup();}
});
