import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY: workplace report and lesson history inherit the selected classroom; explicit All keeps each original lesson once",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="scoped-report-"+randomUUID()+"@example.com",password="SyntheticReportScope-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic mixed workplace report",onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,5,2);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const school=await call("ccp_workplaces_create",{
   name:"Scoped school "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
  });
  expect(school.error).toBeUndefined();
  const personal=await admin.from("workplaces").update({timezone:"UTC"}).eq("teacher_id",teacherId)
   .eq("kind","personal").select("id").single();
  expect(personal.error).toBeNull();
  const schoolId=school.data.entityId as string,personalId=personal.data!.id;
  const learner=await call("ccp_students_create",{name:"Synthetic cross-workplace learner "+randomUUID(),idempotencyKey:randomUUID()});
  expect(learner.error).toBeUndefined();
  const studentId=learner.data.entityId as string;
  for(const workplaceId of [schoolId,personalId]){
   expect((await call("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()})).error).toBeUndefined();
  }
  const schoolSession=randomUUID(),privateSession=randomUUID();
  const day="2063-01-10";
  const seed=await admin.from("teaching_sessions").insert([
   {id:schoolSession,workplace_id:schoolId,starts_at:"2063-01-09T22:30:00Z",local_timezone:"Asia/Jerusalem",duration_minutes:45},
   {id:privateSession,workplace_id:personalId,starts_at:"2063-01-10T01:00:00Z",local_timezone:null,duration_minutes:60},
  ].map(row=>({...row,teacher_id:teacherId,student_id:studentId,title:"Synthetic scoped lesson"})));
  expect(seed.error).toBeNull();
  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:schoolId,expectedSelectedWorkplaceId:null,confirmed:true})).error)
   .toBeUndefined();
  await page.goto("/reports");
  const picker=page.getByTestId("report-workplace-select");
  await expect(picker).toHaveValue(schoolId);
  const range={from:day,to:day};
  const reportHTTP=async(workplace?:string)=>{
   const q=new URLSearchParams(range);
   if(workplace!==undefined)q.set("workplaceId",workplace);
   const r=await page.request.get("/api/coaching/report?"+q);
   expect(r.status(),await r.text()).toBe(200);
   return r.json();
  };
  const historyHTTP=async(workplace?:string)=>{
   const q=new URLSearchParams({...range,studentId});
   if(workplace!==undefined)q.set("workplaceId",workplace);
   const r=await page.request.get("/api/coaching/unified-lessons?"+q);
   expect(r.status(),await r.text()).toBe(200);
   return r.json();
  };
  const selected=await call("ccp_reports_workplace_summary",range);
  expect(selected.error).toBeUndefined();
  expect(selected.data).toEqual(await reportHTTP());
  expect(selected.data).toMatchObject({workplace:{id:schoolId},report:{sessions:1,teachingMinutes:45},
   timezonesUsed:["Asia/Jerusalem"],dateBasis:"session_local_timezone_with_fallback"});
  const selectedHistory=await call("ccp_lessons_history_unified",{...range,studentId});
  expect(selectedHistory.error).toBeUndefined();
  expect(selectedHistory.data).toEqual(await historyHTTP());
  expect(selectedHistory.data.entries.map((x:{id:string})=>x.id)).toEqual([schoolSession]);
  expect(selectedHistory.data.entries[0].workplaceId).toBe(schoolId);

  await picker.selectOption("all");
  await page.locator('input[type="date"]').nth(0).fill(day);
  await page.locator('input[type="date"]').nth(1).fill(day);
  const response=page.waitForResponse(r=>r.url().includes("/api/coaching/report?")&&r.url().includes("workplaceId=all"));
  await page.getByRole("button",{name:"Generate report"}).click();
  const all=await call("ccp_reports_workplace_summary",{...range,workplaceId:null});
  expect(all.error).toBeUndefined();
  expect(all.data).toEqual(await (await response).json());
  expect(all.data).toEqual(await reportHTTP("all"));
  expect(all.data).toMatchObject({workplace:null,report:{sessions:2,teachingMinutes:105,participants:2},
   timezonesUsed:["Asia/Jerusalem","UTC"]});
  expect(all.data.presentation.timezone).toBe("Asia/Jerusalem, UTC");
  const allHistory=await call("ccp_lessons_history_unified",{...range,studentId,workplaceId:null});
  expect(allHistory.error).toBeUndefined();
  expect(allHistory.data).toEqual(await historyHTTP("all"));
  expect(allHistory.data.entries.map((x:{id:string})=>x.id)).toEqual([privateSession,schoolSession]);
  expect(allHistory.data).toMatchObject({total:2,filter:{workplaceId:null},timezonesUsed:["Asia/Jerusalem","UTC"]});
  expect((await call("ccp_workplace_context_get",{})).data.selectedWorkplaceId).toBe(schoolId);

  const explicit=await call("ccp_reports_workplace_summary",{...range,workplaceId:personalId});
  expect(explicit.error).toBeUndefined();
  expect(explicit.data).toEqual(await reportHTTP(personalId));
  expect(explicit.data).toMatchObject({workplace:{id:personalId},report:{sessions:1,teachingMinutes:60},timezonesUsed:["UTC"]});
  const denied=await call("ccp_lessons_history_unified",{...range,studentId,workplaceId:randomUUID()});
  expect(denied.error?.code).toBe("NOT_FOUND");
  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:null,expectedSelectedWorkplaceId:schoolId,confirmed:true})).error)
   .toBeUndefined();
  expect((await call("ccp_reports_workplace_summary",range)).data).toEqual(all.data);
  await page.goto("/reports");
  await expect(picker).toHaveValue("all");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
