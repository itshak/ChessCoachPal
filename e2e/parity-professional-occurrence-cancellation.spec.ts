import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {zonedTimeToUtc} from "../lib/schedule";

test("PARITY:PARITY-professional-occurrence-cancellation skips and restores exactly one original date",async({page,request})=>{
 test.setTimeout(150_000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["127.0.0.1","localhost","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const email="date-cancellation-"+randomUUID()+"@example.invalid",password="SyntheticDateCancellation9!";
 const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(auth.error).toBeNull();
 const teacher_id=auth.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id:teacher_id,email,display_name:"Single date test coach",
   preferred_locale:"en",onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacher_id,8,3);
  const timezone="Asia/Jerusalem";
  const place=await admin.from("workplaces").update({timezone}).eq("teacher_id",teacher_id).eq("kind","personal").select("id").single();
  expect(place.error).toBeNull();
  const workplace_id=place.data!.id;
  const call=await delegatedTool(page,request,undefined,{email,password});
  const student=await call("ccp_students_create",{name:"Single date fixture learner",idempotencyKey:randomUUID()});
  expect(student.error).toBeUndefined();
  const student_id=student.data.entityId as string;
  const hasEnrollment=await admin.from("workplace_enrollments").select("id").eq("teacher_id",teacher_id)
    .eq("student_id",student_id).eq("workplace_id",workplace_id).maybeSingle();
  expect(hasEnrollment.error).toBeNull();
  if(!hasEnrollment.data)expect((await call("ccp_workplaces_enroll",{workplaceId:workplace_id,studentId:student_id,
   idempotencyKey:randomUUID()})).error).toBeUndefined();
  const days=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const [prior,original,neighbor]=[days(70),days(77),days(84)];
  const rows={teacher_id,student_id,workplace_id,duration_minutes:45};
  const rule=await admin.from("lesson_slots").insert({...rows,day_of_week:new Date(original+"T12:00:00Z").getUTCDay(),
   start_date:prior,end_date:neighbor,start_time:"00:30:00",active:true}).select("*").single();
  expect(rule.error).toBeNull();
  const slotId=rule.data!.id;
  const ruleBefore=rule.data;
  const at=(date:string)=>zonedTimeToUtc(date,"00:30:00",timezone).toISOString();
  expect(at(original).slice(0,10)).not.toBe(original);
  const saved=await admin.from("teaching_sessions").insert({...rows,slot_id:slotId,slot_occurrence_date:prior,
   starts_at:at(prior),local_timezone:timezone,status:"scheduled",title:"Protected earlier fixture",
   lesson_note:"Keep the earlier original occurrence unchanged"}).select("*").single();
  expect(saved.error).toBeNull();

  await page.goto("/schedule");
  await page.waitForLoadState("networkidle");
  const path="/api/coaching/calendar/slots/occurrence-cancellation";
  const preview="ccp_recurring_occurrence_cancellation_preview",commit="ccp_recurring_occurrence_cancellation_commit";
  const catalogue=await call.listTools();
  for(const name of [preview,commit])
   expect(catalogue.find(tool=>tool.name===name)?.inputSchema).toMatchObject({type:"object"});
  const cancel={action:"cancel",slotId,originalOccurrenceOn:original,
   expectedUpdatedAt:ruleBefore.updated_at,reason:"Reviewed synthetic original date"};
  const restore={action:"restore",slotId,originalOccurrenceOn:original};
  const read=async(table:string)=>{
   const result=await admin.from(table).select("*").eq("teacher_id",teacher_id).order("id");
   expect(result.error).toBeNull();
   return result.data!;
  };
  const receiptIds=async()=>{
   const result=await admin.from("agent_tool_receipts").select("idempotency_key")
    .eq("teacher_id",teacher_id).in("operation",["canonical.slot.cancel_unmaterialized","canonical.slot.revoke_unmaterialized_cancellation"])
    .order("idempotency_key");
   expect(result.error).toBeNull();return result.data!;
  };
  const originalSessions=await read("teaching_sessions");
  const webReview=await page.request.post(path,{data:cancel});
  expect(webReview.status(),await webReview.text()).toBe(200);
  const review=await webReview.json();
  expect(review).toMatchObject({action:"cancel",slotId,originalOccurrenceOn:original,
   expectedUpdatedAt:ruleBefore.updated_at,writesPerformed:false,requiresExplicitApproval:true});
  expect((await call(preview,cancel)).data).toEqual(review);
  expect((await call(preview,{...cancel,originalOccurrenceOn:prior})).error?.code).toBe("SLOT_OCCURRENCE_ALREADY_MATERIALIZED");
  expect((await call(preview,{...cancel,slotId:randomUUID()})).error?.code).toBe("CANONICAL_SLOT_NOT_FOUND");
  expect((await call(preview,{...cancel,expectedUpdatedAt:"2020-01-01T00:00:00Z"})).error?.code).toBe("CANONICAL_SLOT_REVISION_CONFLICT");
  expect((await call(preview,restore)).error?.code).toBe("SLOT_CANCELLATION_NOT_FOUND");
  const denied=await page.request.put(path,{data:{...cancel,idempotencyKey:randomUUID(),confirmed:false}});
  expect(denied.status()).toBe(400);
  expect(await read("teaching_sessions")).toEqual(originalSessions);
  expect(await read("slot_occurrence_exceptions")).toEqual([]);
  expect(await receiptIds()).toEqual([]);

  const actionButton=page.locator('[data-recurring-slot-id="'+slotId+'"]').getByRole("button",{name:"Cancel or restore one date"});
  const panel=page.getByRole("region",{name:"Cancel or restore one date"});
  const originalInput=panel.getByLabel("Original date");
  const reviewButton=panel.getByRole("button",{name:"Review this date"});
  const confirm=panel.getByRole("button",{name:"Confirm this date change"});
  const tick=panel.getByRole("checkbox",{name:"I approve this change for this date only"});
  await actionButton.press("Enter");
  await originalInput.fill(original);
  await panel.getByLabel("Reason for canceling").fill(cancel.reason);
  await reviewButton.press("Enter");
  await expect(panel.getByRole("status")).toContainText("will be skipped");
  await expect(confirm).toBeDisabled();
  const requests:Record<string,unknown>[]=[];
  await page.route("**"+path,async route=>{
   if(route.request().method()!=="PUT"){await route.continue();return;}
   requests.push(route.request().postDataJSON());
   if(requests.length!==1){await route.continue();return;}
   const upstream=await route.fetch();
   expect(upstream.status(),await upstream.text()).toBe(200);
   await route.abort("failed");
  });
  await tick.check();
  await confirm.press("Enter");
  await expect(panel.getByRole("alert")).toContainText("The result is unconfirmed");
  await expect(originalInput).toBeDisabled();
  await panel.getByRole("button",{name:"Retry the same confirmed change"}).press("Enter");
  await expect(panel.getByRole("status")).toContainText("one date was canceled");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  const replay=await call(commit,requests[0]);
  expect(replay.error).toBeUndefined();
  const exceptionId=replay.data.exceptionId;
  expect(replay.data).toMatchObject({action:"cancel",slotId,originalOccurrenceOn:original,replayed:true});
  expect((await call(commit,{...requests[0],reason:"Different exact approved request"})).error?.code).toBe("SLOT_CANCELLATION_REPLAY_CONFLICT");
  const exceptions=await read("slot_occurrence_exceptions");
  expect(exceptions).toHaveLength(1);
  expect(exceptions[0]).toMatchObject({id:exceptionId,slot_id:slotId,original_occurrence_on:original,action:"cancel",
   approved_by:teacher_id,session_id:null,revision:1,revoked_at:null,reason:cancel.reason,request_id:requests[0].idempotencyKey});
  expect(await read("teaching_sessions")).toEqual(originalSessions);

  const plan=[original,neighbor].map(date=>({...rows,slot_id:slotId,slot_occurrence_date:date,
   starts_at:at(date),local_timezone:timezone,is_home_visit:false,slot_rate_cents:null}));
  const generate=()=>admin.rpc("ccp_canonical_slot_materialize",{p_rows:plan,p_teacher_id:teacher_id});
  const first=await generate();
  expect(first.error).toBeNull();
  expect(first.data).toEqual({planned:2,inserted:1});
  const skipped=await read("teaching_sessions");
  expect(skipped.filter(row=>row.slot_occurrence_date===original)).toEqual([]);
  expect(skipped.find(row=>row.id===saved.data!.id)).toEqual(saved.data);
  expect(skipped.filter(row=>row.slot_occurrence_date===neighbor)).toHaveLength(1);

  const browserRestore=await page.request.post(path,{data:restore});
  expect(browserRestore.status(),await browserRestore.text()).toBe(200);
  const restoreFacts=await browserRestore.json();
  expect(restoreFacts).toEqual({action:"restore",exceptionId,expectedRevision:"1",originalOccurrenceOn:original,
   writesPerformed:false,requiresExplicitApproval:true});
  expect((await call(preview,restore)).data).toEqual(restoreFacts);
  const restoreInputs={action:"restore",exceptionId,expectedRevision:"1",confirmed:true,idempotencyKey:randomUUID()};
  expect((await call(commit,{...restoreInputs,expectedRevision:"2"})).error?.code).toBe("SLOT_CANCELLATION_REVISION_CONFLICT");
  expect((await call(commit,{...restoreInputs,expectedRevision:1})).error?.code).toBe("VALIDATION_ERROR");
  expect((await call(commit,{...restoreInputs,expectedRevision:"9223372036854775808"})).error?.code).toBe("VALIDATION_ERROR");
  expect((await receiptIds())).toHaveLength(1);
  expect(await read("slot_occurrence_exceptions")).toEqual(exceptions);
  await panel.getByRole("button",{name:"Close date editor"}).press("Enter");
  await actionButton.press("Enter");
  await panel.getByLabel("Action").selectOption("restore");
  await originalInput.fill(original);
  await reviewButton.press("Enter");
  await expect(panel.getByRole("status")).toContainText("it is not created now");
  await expect(confirm).toBeDisabled();
  await tick.check();
  await confirm.press("Enter");
  await expect(panel.getByRole("status")).toContainText("No lesson was created");
  expect(requests[2]).toMatchObject({action:"restore",exceptionId,expectedRevision:"1",confirmed:true});
  expect((await call(commit,requests[2])).data).toMatchObject({exceptionId,originalOccurrenceOn:original,replayed:true});
  expect(await read("teaching_sessions")).toEqual(skipped);
  const after=await read("slot_occurrence_exceptions");
  expect(after).toHaveLength(1);
  expect(after[0]).toEqual({...exceptions[0],revision:2,revoked_at:after[0].revoked_at,revoked_by:teacher_id,
   revocation_request_id:requests[2].idempotencyKey});
  expect(after[0].revoked_at).not.toBeNull();
  expect(await receiptIds()).toHaveLength(2);
  expect((await call(preview,restore)).error?.code).toBe("SLOT_CANCELLATION_NOT_FOUND");
  const regenerated=await generate();
  expect(regenerated.error).toBeNull();
  expect(regenerated.data).toEqual({planned:2,inserted:1});
  const scheduled=await read("teaching_sessions");
  expect(scheduled).toHaveLength(skipped.length+1);
  expect(scheduled.filter(row=>row.slot_occurrence_date!==original)).toEqual(skipped);
  expect(scheduled.find(row=>row.slot_occurrence_date===original)).toMatchObject({slot_id:slotId,status:"scheduled"});
  const unchangedRule=await admin.from("lesson_slots").select("*").eq("id",slotId).single();
  expect(unchangedRule.error).toBeNull();
  expect(unchangedRule.data).toEqual(ruleBefore);
  for(const table of ["session_attendance","financial_obligations","credit_redemptions"])
   expect(await read(table)).toEqual([]);
 }finally{expect((await admin.auth.admin.deleteUser(teacher_id,true)).error).toBeNull();}
});
