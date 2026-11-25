import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-professional-occurrence-move keeps the original Jerusalem series date across the DST boundary",async({page,request})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["127.0.0.1","localhost","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="professional-move-"+randomUUID()+"@example.invalid",password="SyntheticOriginalMove4!";
 const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(auth.error).toBeNull();
 const teacher_id=auth.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacher_id,email,display_name:"Original occurrence fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacher_id,8,3);
  const zone="Asia/Jerusalem";
  expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:zone})).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email,password});
  async function workplace(name:string){
   const r=await call("ccp_workplaces_create",{name,timezone:zone,locale:"he",currency:"ILS",policy:{},idempotencyKey:randomUUID()});
   expect(r.error).toBeUndefined();
   return r.data.entityId as string;
  }
  const workplace_id=await workplace("Wednesday venue"),otherPlace=await workplace("Monday venue");
  const student=await call("ccp_students_create",{name:"Original occurrence pupil",idempotencyKey:randomUUID()});
  expect(student.error).toBeUndefined();
  const student_id=student.data.entityId as string;
  for(const id of [workplace_id,otherPlace])
   expect((await call("ccp_workplaces_enroll",{workplaceId:id,studentId:student_id,idempotencyKey:randomUUID()})).error)
    .toBeUndefined();
  // Derive the next future spring-change pair (Friday in Asia/Jerusalem)
  // using runtime hours rather than hardcoding dates that eventually go stale.
  const tz=new Intl.DateTimeFormat("en-GB",{timeZone:zone,hour:"2-digit",hourCycle:"h23"});
  const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
  const plus=(day:string,n:number)=>iso(Date.parse(day+"T00:00:00Z")+n*86400000);
  const hour=(day:string)=>tz.format(new Date(day+"T12:00:00Z"));
  let original="",prior="",destination="";
  const today=iso(Date.now());
  for(let n=10;n<760;n++){
   const day=plus(today,n);
   if(new Date(day+"T12:00:00Z").getUTCDay()!==3||hour(day)!=="15"||hour(plus(day,-7))!=="14")continue;
   original=day;prior=plus(day,-7);destination=plus(day,-1);break;
  }
  expect(original).not.toBe("");
  expect(hour(destination)).toBe("15");
  const fields={teacher_id,student_id,workplace_id,duration_minutes:45,active:true};
  const slot=await admin.from("lesson_slots").insert({...fields,day_of_week:3,start_date:prior,end_date:plus(original,7),start_time:"15:00"}).select("*").single();
  expect(slot.error).toBeNull();
  const slotId=slot.data!.id as string;
  const other=await admin.from("lesson_slots").insert({...fields,workplace_id:otherPlace,day_of_week:1,
   start_date:plus(prior,-2),end_date:plus(original,7),start_time:"13:00"}).select("*").single();
  expect(other.error).toBeNull();
  // Preserve a separately attested prior original occurrence before the offset
  // changes. It is still a schedule row here, not fabricated future teaching.
  const recorded=await admin.from("teaching_sessions").insert({teacher_id,student_id,workplace_id,duration_minutes:45,slot_id:slotId,slot_occurrence_date:prior,
   starts_at:prior+"T13:00:00Z",local_timezone:zone,title:"Protected existing rule occurrence",
   lesson_note:"Keep this explicit schedule note",status:"scheduled"}).select("*").single();
  expect(recorded.error).toBeNull();
  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  const ep="/api/coaching/calendar/slots/occurrence-move", preview="ccp_recurring_occurrence_move_preview",
   commit="ccp_recurring_occurrence_move_commit";
  const arg={slotId,originalOccurrenceOn:original,revisedDate:destination,revisedTime:"15:00",
   expectedUpdatedAt:slot.data!.updated_at,reason:"Reviewed synthetic daylight-saving exception"};
  const before=await admin.from("teaching_sessions").select("*").eq("teacher_id",teacher_id).order("id");
  expect(before.error).toBeNull();
  const p=await page.request.post(ep,{data:arg});
  expect(p.status(),await p.text()).toBe(200);
  const review=await p.json();
  expect(review).toMatchObject({slotId,originalOccurrenceOn:original,timezone:zone,
   requiresExplicitApproval:true,writesPerformed:false});
  expect(new Date(review.originalStartsAt).toISOString()).toBe(original+"T12:00:00.000Z");
  expect(new Date(review.revisedStartsAt).toISOString()).toBe(destination+"T12:00:00.000Z");
  expect((await call(preview,arg)).data).toEqual(review);
  expect((await call(preview,{...arg,originalOccurrenceOn:prior})).error?.code).toBe("SLOT_OCCURRENCE_ALREADY_MATERIALIZED");
  expect((await call(preview,{...arg,slotId:randomUUID()})).error?.code).toBe("CANONICAL_SLOT_NOT_FOUND");
  const noConsent=await page.request.put(ep,{data:{...arg,reviewDigest:review.reviewDigest,idempotencyKey:randomUUID(),confirmed:false}});
  expect(noConsent.status()).toBe(400);
  const afterReview=await admin.from("teaching_sessions").select("*").eq("teacher_id",teacher_id).order("id");
  expect(afterReview.data).toEqual(before.data);

  // Pin the intended row rather than selecting whichever rule appears first.
  const button=page.locator('[data-recurring-slot-id="'+slotId+'"]')
   .getByRole("button",{name:"Move one original occurrence"});
  await button.press("Enter");
  const panel=page.getByRole("region",{name:"Move one original occurrence"});
  await panel.getByLabel("Original recurring date").fill(original);
  await panel.getByLabel("New local date").fill(destination);
  await panel.getByLabel("New local time").fill("15:00");
  await panel.getByLabel("Reason for this move").fill(arg.reason);
  await panel.getByRole("button",{name:"Preview the one-date move"}).press("Enter");
  await expect(panel.getByRole("status")).toContainText(zone);
  const approve=panel.getByRole("button",{name:"Apply this move"});
  await expect(approve).toBeDisabled();
  await panel.getByRole("checkbox",{name:"I approve moving this exact date."}).check();
  const requests:Record<string,unknown>[]=[];
  await page.route("**"+ep,async route=>{
   if(route.request().method()!=="PUT"){await route.continue();return;}
   requests.push(route.request().postDataJSON());
   if(requests.length!==1){await route.continue();return;}
   const saved=await route.fetch();
   expect(saved.status(),await saved.text()).toBe(200);
   await route.abort("failed");
  });
  await approve.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("The move could not be verified");
  await expect(panel.getByLabel("New local date")).toBeDisabled();
  await panel.getByRole("button",{name:"Retry the same approved move"}).press("Enter");
  await expect(panel.getByRole("status")).toContainText("Its original date was preserved");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const replay=await call(commit,requests[0]);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toMatchObject({originalOccurrenceOn:original,slotId,replayed:true});
  const after=await admin.from("teaching_sessions").select("*").eq("teacher_id",teacher_id).order("id");
  expect(after.error).toBeNull();
  expect(after.data!.find(r=>r.id===recorded.data!.id)).toEqual(recorded.data);
  const moved=after.data!.filter(r=>r.slot_occurrence_date===original&&r.slot_id===slotId);
  expect(moved).toHaveLength(1);
  expect(moved[0]).toMatchObject({id:replay.data.sessionId,rescheduled_from_date:original,status:"scheduled",workplace_id});
  expect(new Date(moved[0].starts_at).toISOString()).toBe(destination+"T12:00:00.000Z");
  const otherAfter=await admin.from("lesson_slots").select("*").eq("id",other.data!.id).single();
  expect(otherAfter.data).toEqual(other.data);
  for(const table of ["session_attendance","financial_obligations","credit_redemptions"]){
   const check=await admin.from(table).select("id").eq("teacher_id",teacher_id);
   expect(check.error).toBeNull();expect(check.data).toEqual([]);
  }
 }finally{expect((await admin.auth.admin.deleteUser(teacher_id,true)).error).toBeNull();}
});
