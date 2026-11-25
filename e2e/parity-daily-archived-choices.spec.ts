import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-daily-archived-choices preserves no-write options and retries an uncertain approved recovery",async({page,request})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="archived-choices-"+randomUUID()+"@example.invalid",password="SyntheticArchiveChoice5!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacher_id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacher_id,email,display_name:"Archive choice fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacher_id,8,4);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const place=await call("ccp_workplaces_create",{name:"Archive review fixture location",timezone:"UTC",locale:"en",
   currency:"USD",policy:{},idempotencyKey:randomUUID()});
  expect(place.error).toBeUndefined();
  const workplaceId=place.data.entityId as string;
  const name="Historical review learner",another="Available learner";
  async function student(name:string){
   const r=await call("ccp_students_create",{name,idempotencyKey:randomUUID()});
   expect(r.error).toBeUndefined();
   const id=r.data.entityId as string;
   expect((await call("ccp_workplaces_enroll",{workplaceId,studentId:id,idempotencyKey:randomUUID()})).error).toBeUndefined();
   return id;
  }
  const archived=await student(name),alternative=await student(another),alias="דניאל Павлов";
  for(const id of [archived,alternative])
   expect((await page.request.put("/api/students/"+id,{data:{nameAliases:[alias]}})).status()).toBe(200);
  const status=await call("ccp_students_lifecycle_preview",{studentId:archived});
  expect((await call("ccp_students_lifecycle_commit",{studentId:archived,mode:"archive",
   expectedUpdatedAt:status.data.expectedUpdatedAt,selectedWorkplaceIds:[],requestId:randomUUID(),confirmed:true,
   reason:"Retain historical student without enabling a new lesson"})).error).toBeUndefined();
  const date=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
  const title="Exactly approved fixture recovery";
  const future={names:[name],workplaceId,title,startsAt:date(4)+"T11:00:00Z",durationMinutes:60};
  const historical={...future,startsAt:date(-4)+"T11:00:00Z"};
  const urlPreview="/api/coaching/lesson-capture/preview";
  async function compare(input:Record<string,unknown>){
   const web=await page.request.post(urlPreview,{data:input});
   expect(web.status(),await web.text()).toBe(200);
   const result=await web.json();
   expect((await call("ccp_lessons_capture_preview",input)).data).toEqual(result);
   return result;
  }
  const historyPath="/students/"+archived+"#learner-evidence";
  const before=await compare(future);
  expect(before).toMatchObject({canCommit:false,archivedRecovery:{
   keepArchived:{writesPerformed:false,requiresToolCall:false},
   chooseAnother:{writesPerformed:false,nextTool:"ccp_lessons_capture_preview"},
   reviewHistory:{writesPerformed:false,tool:"ccp_learner_evidence_get",learners:[{studentId:archived,path:historyPath}]},
   reactivationRequiresExactReview:true}});
  expect((await compare(historical)).archivedRecovery).toEqual(before.archivedRecovery);
  const collision=await compare({...future,names:[alias]});
  expect(collision).toMatchObject({canCommit:false,archivedRecovery:null,resolutions:[{status:"ambiguous"}]});
  expect((await compare({...future,names:[alias],studentChoices:[{index:0,studentId:alternative}]})).archivedRecovery).toBeNull();
  expect((await compare({...future,names:[alias],studentChoices:[{index:0,studentId:archived}]})).archivedRecovery)
   .toEqual(before.archivedRecovery);
  async function snapshots(){
   const result=await Promise.all(["students","workplace_enrollments","teaching_sessions","session_participants",
    "ccp_historical_attendance_evidence"].map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id)));
   result.forEach(r=>expect(r.error).toBeNull());
   return result.map(r=>r.data!.map(row=>JSON.stringify(row)).sort());
  }
  const original=await snapshots();
  await page.goto("/coaching");
  await page.waitForLoadState("networkidle");
  const names=page.getByLabel("Student names, one per line (1–50)");
  const keep=page.getByRole("button",{name:"Keep archived"});
  const change=page.getByRole("button",{name:"Choose another learner"});
  const history=page.getByRole("link",{name:"Review history for "+name});
  async function review(days:number){
   await names.fill(name);
   await page.getByLabel("Workplace / time zone").selectOption(workplaceId);
   await page.getByLabel("Lesson title").fill(title);
   await page.getByLabel("Start time in workplace time zone").fill(date(days)+"T11:00");
   const submit=page.getByRole("button",{name:"Preview only",exact:true});
   expect(await submit.evaluate(node=>[...((node as HTMLButtonElement).form?.elements??[])]
    .flatMap(el=>el instanceof HTMLElement&&"validity" in el&&!(el as HTMLInputElement).validity.valid?[
     {label:(el as HTMLInputElement).labels?.[0]?.textContent,message:(el as HTMLInputElement).validationMessage}
    ]:[]))).toEqual([]);
   const signed=page.waitForResponse(r=>r.url().endsWith(urlPreview)&&r.request().method()==="POST");
   await submit.click();
   const response=await signed;
   expect(response.status(),await response.text()).toBe(200);
   expect(await response.json()).toMatchObject({archivedRecovery:before.archivedRecovery});
   await expect(keep).toBeEnabled();
  }
  await review(4);
  await change.press("Enter");
  await expect(names).toBeFocused();
  await expect(keep).toHaveCount(0);
  await review(4);
  await keep.press("Enter");
  const kept=page.getByRole("status").filter({hasText:"Learner kept archived. No lesson was created."});
  await expect(kept).toBeFocused();
  await review(-4);
  await expect(history).toHaveAttribute("href",historyPath);
  await history.click();
  await expect(page.getByRole("region",{name:"Lesson and import evidence"})).toContainText("Archived learner");
  expect((await call("ccp_learner_evidence_get",{studentId:archived})).data).toMatchObject({archived:true});
  expect(await snapshots()).toEqual(original);

  await page.goto("/coaching");
  await page.waitForLoadState("networkidle");
  await review(4);
  await page.getByRole("button",{name:"Review archived learner and lesson"}).click();
  await page.getByLabel(/Reason for reactivation and new lesson/).fill("Explicitly return the exact learner for this synthetic lesson");
  await page.getByLabel(/I approve reactivating these exact archived students/).check();
  const commitBodies:Record<string,unknown>[]=[];
  const endpoint="/api/coaching/lesson-capture/recovery/commit";
  await page.route("**"+endpoint,async route=>{
   commitBodies.push(route.request().postDataJSON());
   if(commitBodies.length!==1){await route.continue();return;}
   const saved=await route.fetch();
   expect(saved.status(),await saved.text()).toBe(200);
   await route.abort("failed");
  });
  await page.getByRole("button",{name:"Confirm reactivation and create lesson"}).click();
  await expect(page.getByRole("alert").filter({hasText:"The save could not be verified"})).toBeVisible();
  await expect(keep).toBeDisabled();
  await expect(change).toBeDisabled();
  await expect(history).toHaveCount(0);
  await expect(names).toBeDisabled();
  await page.getByRole("button",{name:"Retry this exact approved recovery"}).click();
  await expect(page.getByRole("status").filter({hasText:"archived students reactivated atomically"})).toBeVisible();
  expect(commitBodies).toHaveLength(2);
  expect(commitBodies[1]).toEqual(commitBodies[0]);
  const proof=await call("ccp_lessons_archived_recovery_commit",commitBodies[0]);
  expect(proof.error).toBeUndefined();
  expect(proof.data).toMatchObject({replayed:true,reactivatedStudentIds:[archived]});
  const exact=await admin.from("teaching_sessions").select("id,student_id,workplace_id").eq("teacher_id",teacher_id);
  expect(exact.error).toBeNull();
  expect(exact.data).toEqual([{id:proof.data.id,student_id:archived,workplace_id:workplaceId}]);
 }finally{expect((await admin.auth.admin.deleteUser(teacher_id,true)).error).toBeNull();}
});
