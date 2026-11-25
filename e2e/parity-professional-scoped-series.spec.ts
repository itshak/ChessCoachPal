import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-scoped-series reviews and edits linked future rules without rewriting evidence",async({page,request})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["127.0.0.1","localhost","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="professional-series-"+randomUUID()+"@example.invalid",password="SyntheticScopedSeries4!";
 const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(auth.error).toBeNull();
 const teacher_id=auth.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacher_id,email,display_name:"Scoped recurrence fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacher_id,8,3);
  expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email,password});
  const place=await call("ccp_workplaces_create",{name:"Original weekly venue",timezone:"UTC",locale:"en",
   currency:"USD",policy:{},idempotencyKey:randomUUID()});
  expect(place.error).toBeUndefined();
  const workplace_id=place.data.entityId as string;
  const student=await call("ccp_students_create",{name:"Scoped series pupil",idempotencyKey:randomUUID()});
  expect(student.error).toBeUndefined();
  const student_id=student.data.entityId as string;
  expect((await call("ccp_workplaces_enroll",{workplaceId:workplace_id,studentId:student_id,idempotencyKey:randomUUID()})).error)
   .toBeUndefined();
  const today=Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z");
  const day=(offset:number)=>new Date(today+offset*86400000).toISOString().slice(0,10);
  const fields={teacher_id,student_id,workplace_id,day_of_week:new Date(today).getUTCDay(),
   duration_minutes:45,active:true};
  const root=await admin.from("lesson_slots").insert({...fields,start_date:day(7),end_date:day(21),start_time:"08:00"}).select("*").single();
  expect(root.error).toBeNull();
  const slotId=root.data!.id as string;
  const later=await admin.from("lesson_slots").insert({...fields,series_id:slotId,
   start_date:day(35),end_date:day(42),start_time:"10:00"}).select("*").single();
  expect(later.error).toBeNull();
  // Populate the schedule UI before taking the no-write proof: loading that
  // existing screen may materialize its normal bounded calendar window.
  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  const base={slotId,scope:"this_and_future",originalCutoff:day(14),reviewThrough:day(42),successorId:randomUUID(),
   expectedUpdatedAt:root.data!.updated_at,changes:{startTime:"12:30"}};
  const ep="/api/coaching/calendar/slots/scoped",
   previewTool="ccp_recurring_series_edit_preview",commitTool="ccp_recurring_series_edit_commit";
  expect((await call.listTools()).map(t=>t.name)).toEqual(expect.arrayContaining([previewTool,commitTool]));
  async function snapshot(){
   const rows=await Promise.all(["lesson_slots","teaching_sessions","slot_occurrence_exceptions","session_attendance"]
    .map(table=>admin.from(table).select("*").eq("teacher_id",teacher_id).order("id")));
   expect(rows.map(r=>r.error)).toEqual([null,null,null,null]);
   return rows.map(r=>r.data);
  }
  const before=await snapshot();
  const preview=await page.request.post(ep,{data:base});
  expect(preview.status(),await preview.text()).toBe(200);
  const safe=await preview.json();
  expect(safe).toMatchObject({anchorId:slotId,scope:"this_and_future",cutoff:day(14),
   affectedSegments:2,writesPerformed:false,requiresExplicitApproval:true});
  expect((await call(previewTool,base)).data).toEqual(safe);
  const entire={...base,scope:"entire_series",originalCutoff:null,successorId:null};
  const all=await call(previewTool,entire);
  expect(all.error).toBeUndefined();
  expect(all.data).toMatchObject({scope:"entire_series",affectedSegments:2});
  expect((await call(previewTool,{...base,slotId:randomUUID()})).error?.code).toBe("RECURRENCE_SCOPE_NOT_FOUND");
  expect((await page.request.put(ep,{data:{...base,reviewDigest:safe.reviewDigest,
   idempotencyKey:randomUUID(),confirmed:false}})).status()).toBe(400);
  expect(await snapshot()).toEqual(before);

  const buttons=page.getByRole("button",{name:"Review a recurring series edit"});
  await buttons.first().press("Enter");
  const panel=page.getByRole("region",{name:"Review a recurring series edit"});
  await panel.getByLabel("Original occurrence date").fill(day(14));
  await panel.getByLabel("Review through date").fill(day(42));
  await panel.getByLabel("New local time").fill("12:30");
  await panel.getByRole("button",{name:"Preview series changes"}).press("Enter");
  await expect(panel.getByRole("status")).toContainText("2 segments");
  const apply=panel.getByRole("button",{name:"Apply reviewed edit"});
  await expect(apply).toBeDisabled();
  await panel.getByRole("checkbox",{name:"I approve this exact reviewed edit."}).check();
  const requests:Record<string,unknown>[]=[];
  await page.route("**"+ep,async route=>{
   if(route.request().method()!=="PUT"){await route.continue();return;}
   requests.push(route.request().postDataJSON());
   if(requests.length!==1){await route.continue();return;}
   const saved=await route.fetch();
   expect(saved.status(),await saved.text()).toBe(200);
   await route.abort("failed");
  });
  await apply.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("The result could not be verified");
  await expect(panel.getByLabel("New local time")).toBeDisabled();
  await panel.getByRole("button",{name:"Retry the same approved edit"}).press("Enter");
  await expect(panel.getByRole("status")).toContainText("The reviewed series edit was saved");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect((await call(commitTool,requests[0])).data).toMatchObject({replayed:true,seriesId:slotId});
  const after=await admin.from("lesson_slots").select("id,series_id,start_time,end_date").eq("teacher_id",teacher_id);
  expect(after.error).toBeNull();
  expect(after.data).toEqual(expect.arrayContaining([
   {id:slotId,series_id:slotId,start_time:"08:00:00",end_date:day(13)},
   {id:requests[0].successorId,series_id:slotId,start_time:"12:30:00",end_date:day(21)},
   {id:later.data!.id,series_id:slotId,start_time:"12:30:00",end_date:day(42)},
  ]));
  expect(after.data).toHaveLength(3);
 }finally{expect((await admin.auth.admin.deleteUser(teacher_id,true)).error).toBeNull();}
});
