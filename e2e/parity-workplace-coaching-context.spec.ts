import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;

test("PARITY: Coaching drafts and lesson discovery follow selected workplace without narrowing global identities",async({page,request})=>{
 test.setTimeout(90000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="coaching-context-"+randomUUID()+"@example.com",password="SyntheticCoachingContext-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic Coaching context",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,5,3);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const other=await call("ccp_workplaces_create",{name:"Synthetic Coaching School "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",
   locale:"en",policy:{},idempotencyKey:randomUUID()});
  expect(other.error).toBeUndefined();
  const school=other.data.entityId as string;
  const personal=await admin.from("workplaces").select("id").eq("teacher_id",teacherId).eq("kind","personal").single();
  expect(personal.error).toBeNull();
  const privateId=personal.data!.id;
  async function learner(name:string){
   const s=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
   expect(s.error).toBeUndefined();
   return s.data.entityId as string;
  }
  const name="Synthetic dual learner "+randomUUID();
  const privateName="Synthetic private only learner "+randomUUID();
  const studentId=await learner(name),privateStudentId=await learner(privateName);
  for(const [workplaceId,id] of [[school,studentId],[privateId,studentId],[privateId,privateStudentId]]){
   expect((await call("ccp_workplaces_enroll",{workplaceId,studentId:id,idempotencyKey:randomUUID()})).error).toBeUndefined();
  }
  const schoolLesson=randomUUID(),privateLesson=randomUUID();
  const rows=[
   {id:schoolLesson,workplace_id:school,title:"Synthetic School lesson",starts_at:"2063-02-02T12:00:00Z"},
   {id:privateLesson,workplace_id:privateId,title:"Synthetic private lesson",starts_at:"2063-02-03T12:00:00Z"},
  ];
  expect((await admin.from("teaching_sessions").insert(rows.map(row=>({...row,teacher_id:teacherId,student_id:studentId,
   duration_minutes:45,local_timezone:"UTC"})))).error).toBeNull();
  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:school,expectedSelectedWorkplaceId:null,confirmed:true})).error).toBeUndefined();
  await page.goto("/coaching");
  const capture=page.getByRole("region",{name:"Multi-student lesson capture"});
  const completion=page.getByRole("combobox",{name:"Lesson to complete"});
  const learning=page.getByRole("combobox",{name:"Related coaching lesson"});
  const history=page.getByRole("region",{name:"Material learning history"});
  const captureVenue=capture.locator("select").first();
  const historyVenue=history.locator("label").filter({hasText:"Workplace (optional)"}).locator("select");
  await expect(captureVenue).toHaveValue(school);
  await expect(historyVenue).toHaveValue(school);
  for(const picker of [completion,learning]){
   await expect(picker.locator('option[value="'+schoolLesson+'"]')).toHaveCount(1);
   await expect(picker.locator('option[value="'+privateLesson+'"]')).toHaveCount(0);
  }
  const discovery=await page.request.post("/api/agent/v1",{headers:{origin},data:{action:"sessions.list",workplaceId:school}});
  expect(discovery.status(),await discovery.text()).toBe(200);
  const mcpSessions=await call("ccp_sessions_list",{workplaceId:school});
  expect(mcpSessions.error).toBeUndefined();
  expect(mcpSessions.data.map((row:{id:string})=>row.id)).toEqual([schoolLesson]);
  expect((await discovery.json()).data.map((row:{id:string})=>row.id)).toEqual([schoolLesson]);
  const exact=await call("ccp_sessions_participants",{sessionId:privateLesson});
  expect(exact.error).toBeUndefined();
  expect(exact.data).toEqual([{student_id:studentId,students:{name}}]);
  const globalStudents=await call("ccp_students_roster",{});
  expect(globalStudents.data.students.some((s:{id:string})=>s.id===privateStudentId)).toBe(true);
  const previewArgs={names:[name],title:"Synthetic review only",startsAt:"2063-02-10T12:00:00Z",durationMinutes:45};
  const preview=await call("ccp_lessons_capture_preview",previewArgs);
  expect(preview.error).toBeUndefined();
  expect(preview.data.workplace?.id).toBe(school);
  const httpPreview=await page.request.post("/api/coaching/lesson-capture/preview",{data:previewArgs,headers:{origin}});
  expect(httpPreview.status(),await httpPreview.text()).toBe(200);
  expect(await httpPreview.json()).toEqual(preview.data);
  const allPreview=await call("ccp_lessons_capture_preview",{...previewArgs,workplaceId:null});
  expect(allPreview.error).toBeUndefined();
  expect(allPreview.data.issues).toContainEqual(expect.objectContaining({code:"AMBIGUOUS_WORKPLACE"}));
  const override=await call("ccp_lessons_capture_preview",{...previewArgs,workplaceId:privateId});
  expect(override.error).toBeUndefined();
  expect(override.data.workplace?.id).toBe(privateId);
  const scopedMaterial=await call("ccp_materials_history_list",{studentId,workplaceId:school});
  expect(scopedMaterial.error).toBeUndefined();
  const httpMaterial=await page.request.get("/api/coaching/materials?studentId="+studentId+"&workplaceId="+school);
  expect(httpMaterial.status(),await httpMaterial.text()).toBe(200);
  expect(await httpMaterial.json()).toEqual(scopedMaterial.data);
  const before=await admin.from("teaching_sessions").select("id",{count:"exact",head:true}).eq("teacher_id",teacherId);
  expect(before.error).toBeNull();expect(before.count).toBe(2);
  const upcoming=await call("ccp_sessions_create",{
   workplaceId:school,studentId,title:"Synthetic next lesson",durationMinutes:45,
   startsAt:new Date(Date.now()+2*86400000).toISOString(),idempotencyKey:randomUUID(),
  });
  expect(upcoming.error).toBeUndefined();
  const upcomingId=upcoming.data.entityId as string;
  const prepare=await call("ccp_lesson_preparation_get",{sessionId:upcomingId});
  expect(prepare.error).toBeUndefined();
  expect(prepare.data.lesson).toMatchObject({id:upcomingId,title:"Synthetic next lesson"});
  await page.goto("/students/"+studentId);
  const next=page.locator('section[aria-labelledby="next-student-lesson"]');
  await expect(next.getByRole("heading",{name:"Synthetic next lesson"})).toBeVisible();
  await expect(next.locator("a")).toHaveAttribute("href","/dashboard?prepareSession="+upcomingId+"#lesson-preparation");

  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:null,expectedSelectedWorkplaceId:school,confirmed:true})).error).toBeUndefined();
  await page.goto("/coaching");
  await expect(captureVenue).toHaveValue("");
  await expect(historyVenue).toHaveValue("");
  for(const picker of [completion,learning]){
   await expect(picker.locator('option[value="'+schoolLesson+'"]')).toHaveCount(1);
   await expect(picker.locator('option[value="'+privateLesson+'"]')).toHaveCount(1);
  }
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
