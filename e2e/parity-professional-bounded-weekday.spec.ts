import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {dayOfWeek} from "../lib/schedule";

test("PARITY:PARITY-professional-bounded-weekday reviews distinct finite dates before editing the series",async({page,request})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["127.0.0.1","localhost","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="bounded-weekday-"+randomUUID()+"@example.invalid",password="SyntheticBoundedWeekday4!";
 const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(auth.error).toBeNull();
 const teacher_id=auth.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacher_id,email,display_name:"Bounded weekday fixture",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacher_id,8,3);
  expect((await admin.from("teacher_settings").upsert({teacher_id,timezone:"UTC"})).error).toBeNull();
  const call=await delegatedTool(page,request,undefined,{email,password});
  const place=await call("ccp_workplaces_create",{name:"Finite weekday fixture venue",timezone:"UTC",locale:"en",
   currency:"USD",policy:{},idempotencyKey:randomUUID()});
  expect(place.error).toBeUndefined();
  const workplace_id=place.data.entityId;
  const student=await call("ccp_students_create",{name:"Finite date fixture learner",idempotencyKey:randomUUID()});
  expect(student.error).toBeUndefined();
  const student_id=student.data.entityId;
  expect((await call("ccp_workplaces_enroll",{workplaceId:workplace_id,studentId:student_id,idempotencyKey:randomUUID()})).error)
   .toBeUndefined();
  const now=Date.parse(new Date().toISOString().slice(0,10)+"T00:00:00Z");
  const day=(n:number)=>new Date(now+n*86400000).toISOString().slice(0,10);
  const weekday=dayOfWeek(day(72)),oldWeekday=dayOfWeek(day(70));
  const scope={teacher_id,student_id,workplace_id};
  const common={...scope,day_of_week:oldWeekday,duration_minutes:45,rate_cents:1900,active:true};
  const make=async(n:number,end:number|null,time:string,series_id?:string)=>{
   const r=await admin.from("lesson_slots").insert({...common,start_date:day(n),end_date:end===null?null:day(end),
    start_time:time,...(series_id?{series_id}:{})}).select("*").single();
   expect(r.error).toBeNull();return r.data!;
  };
  const root=await make(70,91,"09:00:00");
  const later=await make(105,121,"10:00:00",root.id);
  const unbounded=await make(140,null,"15:00:00");
  const blocked=await make(126,139,"12:00:00");
  const kept=await admin.from("teaching_sessions").insert({...scope,slot_id:root.id,slot_occurrence_date:day(70),
    starts_at:day(70)+"T09:00:00Z",duration_minutes:45,local_timezone:"UTC",title:"Earlier fixture lesson",
    lesson_note:"Existing original date is protected",status:"scheduled"}).select("*").single();
  expect(kept.error).toBeNull();
  const plan=[[root,day(84)],[later,day(112)]].map(([slot,date])=>({...scope,slot_id:slot.id,slot_occurrence_date:date,
   starts_at:date+"T"+slot.start_time+"Z",local_timezone:"UTC",duration_minutes:45,slot_rate_cents:1900,is_home_visit:false}));
  const drafts=await admin.rpc("ccp_canonical_slot_materialize",{p_rows:plan,p_teacher_id:teacher_id});
  expect(drafts.error).toBeNull();expect(drafts.data).toEqual({planned:2,inserted:2});
  const approvedCancellation=await call("ccp_recurring_occurrence_cancellation_commit",{
   action:"cancel",slotId:blocked.id,originalOccurrenceOn:day(126),expectedUpdatedAt:blocked.updated_at,
   reason:"Synthetic approved exception on original date",idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(approvedCancellation.error).toBeUndefined();

  await page.setViewportSize({width:320,height:812});
  const expectNoHorizontalOverflow=async()=>{
   const size=await page.evaluate(()=>{
    const viewport=document.scrollingElement??document.documentElement;
    return viewport.scrollWidth-viewport.clientWidth;
   });
   expect(size).toBeLessThanOrEqual(1);
  };
  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  const ep="/api/coaching/calendar/slots/scoped",preview="ccp_recurring_series_edit_preview",commit="ccp_recurring_series_edit_commit";
  const key=randomUUID();
  const input={slotId:root.id,scope:"this_and_future",originalCutoff:day(77),reviewThrough:day(121),successorId:randomUUID(),
   expectedUpdatedAt:root.updated_at,changes:{dayOfWeek:weekday}};
  const read=async(table:string)=>{
   const r=await admin.from(table).select("*").eq("teacher_id",teacher_id).order("id");
   expect(r.error).toBeNull();return r.data!;
  };
  const receipts=async()=>{
   const r=await admin.from("agent_tool_receipts").select("receipt").eq("teacher_id",teacher_id)
    .eq("operation","canonical.slot.edit.scoped").order("idempotency_key");
   expect(r.error).toBeNull();return r.data!;
  };
  const beforeRules=await read("lesson_slots"),beforeLessons=await read("teaching_sessions"),exceptions=await read("slot_occurrence_exceptions");
  const earlier=await page.request.post(ep,{data:{...input,reviewThrough:day(108)}});
  expect(earlier.status()).toBe(400);
  expect((await earlier.json()).code).toBe("RECURRENCE_SCOPE_WEEKDAY_COMPLETE_FINITE_RANGE_REQUIRED");
  expect((await call(preview,{...input,slotId:unbounded.id,expectedUpdatedAt:unbounded.updated_at,
   successorId:null,originalCutoff:day(140),reviewThrough:day(154)})).error?.code)
   .toBe("RECURRENCE_SCOPE_WEEKDAY_COMPLETE_FINITE_RANGE_REQUIRED");
  expect((await call(preview,{...input,slotId:blocked.id,expectedUpdatedAt:blocked.updated_at,
   successorId:null,originalCutoff:day(126),reviewThrough:day(139)})).error?.code)
   .toBe("RECURRENCE_SCOPE_WEEKDAY_ORIGINAL_EVIDENCE");
  const response=await page.request.post(ep,{data:input});
  expect(response.status(),await response.text()).toBe(200);
  const correct=await response.json();
  expect(correct).toMatchObject({planned:5,affectedSegments:2,replaceableDrafts:2,
   requiresExplicitApproval:true,writesPerformed:false,weekdayDateChanges:[
    {sourceSlotId:root.id,targetSlotId:input.successorId,oldOriginalDates:[77,84,91].map(day),newOriginalDates:[79,86].map(day)},
    {sourceSlotId:later.id,targetSlotId:later.id,oldOriginalDates:[105,112,119].map(day),newOriginalDates:[107,114,121].map(day)},
   ]});
  expect((await call(preview,input)).data).toEqual(correct);
  const denied=await page.request.put(ep,{data:{...input,reviewDigest:correct.reviewDigest,idempotencyKey:key,confirmed:false}});
  expect(denied.status()).toBe(400);
  const changed=await call(commit,{...input,changes:{dayOfWeek:(weekday+1)%7},reviewDigest:correct.reviewDigest,idempotencyKey:key,confirmed:true});
  expect(changed.error?.code).toBe("RECURRENCE_SCOPE_REVIEW_CONFLICT");
  expect(await read("lesson_slots")).toEqual(beforeRules);
  expect(await read("teaching_sessions")).toEqual(beforeLessons);
  expect(await read("slot_occurrence_exceptions")).toEqual(exceptions);
  expect(await receipts()).toEqual([]);

  const button=page.locator('[data-recurring-slot-id="'+root.id+'"]').getByRole("button",{name:"Review a recurring series edit"});
  await button.press("Enter");
  const panel=page.getByRole("region",{name:"Review a recurring series edit"});
  await panel.getByLabel("Original occurrence date").fill(day(77));
  await panel.getByLabel("Review through date").fill(day(121));
  await panel.getByLabel("New weekday").selectOption(String(weekday));
  await panel.getByRole("button",{name:"Preview series changes"}).press("Enter");
  const lists=panel.getByRole("region",{name:"Original and proposed local dates"});
  for(let n=0;n<2;n++){
   const section=lists.getByRole("region",{name:"Affected segment "+(n+1)});
   await expect(section.getByRole("list")).toHaveCount(2);
   const actual=await section.getByRole("list").evaluateAll(ls=>ls.map(l=>Array.from(l.querySelectorAll("time"),t=>t.dateTime)));
   expect(actual).toEqual([correct.weekdayDateChanges[n].oldOriginalDates,correct.weekdayDateChanges[n].newOriginalDates]);
  }
  await expectNoHorizontalOverflow();
  const apply=panel.getByRole("button",{name:"Apply reviewed edit"});
  await expect(apply).toBeDisabled();
  let approved:Record<string,unknown>|undefined;
  await page.route("**"+ep,async route=>{
   if(route.request().method()==="PUT")approved=route.request().postDataJSON();
   await route.continue();
  });
  await panel.getByRole("checkbox",{name:"I approve this exact reviewed edit."}).check();
  await apply.press("Enter");
  await expect(panel.getByRole("status")).toContainText("The reviewed series edit was saved");
  expect(approved).toBeDefined();
  const replay=await call(commit,approved!);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toMatchObject({replayed:true,removedFutureDrafts:2,weekdayDateChanges:[
   {...correct.weekdayDateChanges[0],targetSlotId:approved!.successorId},
   correct.weekdayDateChanges[1],
  ]});
  const after=await read("teaching_sessions");
  expect(after.find(row=>row.id===kept.data!.id)).toEqual(kept.data);
  const datesFor=(id:unknown)=>after.filter(row=>row.slot_id===id).map(row=>row.slot_occurrence_date).sort();
  expect(datesFor(root.id)).toEqual([day(70)]);
  expect(datesFor(approved!.successorId)).toEqual([79,86].map(day));
  expect(datesFor(later.id)).toEqual([107,114,121].map(day));
  const finalRules=await read("lesson_slots");
  expect(finalRules.find(row=>row.id===root.id)).toMatchObject({day_of_week:oldWeekday,end_date:day(76)});
  expect(finalRules.find(row=>row.id===approved!.successorId)).toMatchObject({day_of_week:weekday,start_date:day(77),end_date:day(91),workplace_id,rate_cents:1900});
  expect(finalRules.find(row=>row.id===unbounded.id)).toEqual(unbounded);
  expect(finalRules.find(row=>row.id===blocked.id)).toEqual(blocked);
  expect(await read("slot_occurrence_exceptions")).toEqual(exceptions);
  expect(await receipts()).toHaveLength(1);
  for(const table of ["session_attendance","financial_obligations","credit_redemptions"])expect(await read(table)).toEqual([]);
 }finally{expect((await admin.auth.admin.deleteUser(teacher_id,true)).error).toBeNull();}
});
