import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: private recurring coach terms use the proven root and actual non-UTC taught day",async({page,request,browser,baseURL,isolatedTeacher})=>{
 test.setTimeout(145_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const origin=new URL(page.url()).origin;
 const run=async(name:string,args:Record<string,unknown>)=>{
  const out=await call(name,args);expect(out.error,name).toBeUndefined();return out.data;
 };
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const venue=await run("ccp_workplaces_create",{name:"Series venue "+randomUUID(),timezone:"Asia/Jerusalem",currency:"ILS",idempotencyKey:randomUUID()});
 const workplaceId=String(venue.entityId),studentId=String((await run("ccp_students_create",{
  name:"Private series student "+randomUUID(),idempotencyKey:randomUUID()})).entityId);
 await run("ccp_workplaces_enroll",{workplaceId,studentId,idempotencyKey:randomUUID()});
 const account=await run("ccp_billing_accounts_create",{displayName:"Series counterparty "+randomUUID(),accountKind:"organization",...key()});
 const billingAccountId=String(account.id),start=new Date(Date.now()+14*86400000);
 const day=start.toISOString().slice(0,10),taught=new Date(start.getTime()+86400000).toISOString().slice(0,10),later=new Date(start.getTime()+7*86400000).toISOString().slice(0,10);
 const mk=async(startTime:string)=>String((await run("ccp_recurring_slots_create",{
  workplaceId,studentId,dayOfWeek:start.getUTCDay(),startTime,startDate:day,endDate:later,durationMinutes:60,...key(),
 })).id);
 const first=await mk("00:15"),second=await mk("14:00");
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const login=await db.auth.signInWithPassword(isolatedTeacher);
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const materialized=await db.from("teaching_sessions").select("id,source_private_series_id,slot_occurrence_date,starts_at")
  .in("source_private_series_id",[first,second]).order("starts_at");
 expect(materialized.error).toBeNull();
 const rows=materialized.data!;
 const occurrence=rows.find(x=>x.source_private_series_id===first&&x.slot_occurrence_date===day)!;
 const priority=rows.find(x=>x.source_private_series_id===first&&x.slot_occurrence_date===later)!;
 const unrelated=rows.find(x=>x.source_private_series_id===second&&x.slot_occurrence_date===day)!;
 expect(occurrence.starts_at.slice(0,10)).not.toBe(day);
 const movedStart=new Date(Date.parse(occurrence.starts_at)+86400000).toISOString();
 const old=await run("ccp_sessions_details",{sessionId:occurrence.id});
 await run("ccp_sessions_reschedule",{sessionId:occurrence.id,startsAt:movedStart,durationMinutes:60,
  expectedUpdatedAt:old.updated_at,...key()});
 expect(movedStart.slice(0,10)).not.toBe(taught);
 for(const row of [occurrence,priority,unrelated]){
  const details=await run("ccp_sessions_details",{sessionId:row.id});
  const roster=await run("ccp_attendance_preview",{sessionId:row.id});
  await run("ccp_sessions_complete",{sessionId:row.id,expectedUpdatedAt:details.updated_at,...key(),attendance:[
   {studentId,status:"present",note:"Synthetic private attendance notes",expectedUpdatedAt:roster.attendance[0].updated_at},
  ]});
 }
 // Disposable synthetic setup matches the canonical SQL proof: a detached
 // already-completed occurrence retains its protected source stamp.
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const detached=await admin.from("teaching_sessions").update({slot_id:null})
  .eq("id",occurrence.id).eq("teacher_id",teacherId).select("id,slot_id,source_private_series_id,slot_occurrence_date").single();
 expect(detached.error).toBeNull();
 expect(detached.data).toMatchObject({slot_id:null,source_private_series_id:first,slot_occurrence_date:day});
 const legacy=randomUUID();
 const oldRow=await admin.from("teaching_sessions").insert({id:legacy,teacher_id:teacherId,workplace_id:workplaceId,
  student_id:studentId,title:"Synthetic legacy detached",starts_at:taught+"T15:00:00Z",duration_minutes:45,
  status:"completed",slot_occurrence_date:taught,local_timezone:"Asia/Jerusalem"});
 expect(oldRow.error).toBeNull();
 const priorityTerms=await run("ccp_compensation_agreements_create",{workplaceId,billingAccountId,agreementRole:"coach_earning",
  exactSessionId:priority.id,currency:"ILS",model:"per_session",rateCents:20000,effectiveFrom:later,effectiveTo:later,...key()});
 const broad=await run("ccp_compensation_agreements_create",{workplaceId,billingAccountId,agreementRole:"coach_earning",
  currency:"ILS",model:"per_session",rateCents:9000,effectiveFrom:day,effectiveTo:later,...key()});
 const uri="/api/compensation-agreements/private-series";
 const args={workplaceId,privateSeriesId:first};
 const read=await page.request.get(uri+"?"+new URLSearchParams(args));
 expect(read.status(),await read.text()).toBe(200);expect(read.headers()["cache-control"]).toBe("no-store");
 expect(await run("ccp_compensation_private_series_review",args)).toEqual(await read.json());
 const reader=await browser.newContext({baseURL});
 try{
  const readOnly=await delegatedTool(await reader.newPage(),request,"coach:read",isolatedTeacher);
  const visible=await readOnly.listTools();
  expect(visible.some(x=>x.name==="ccp_compensation_private_series_review")).toBe(true);
  expect(visible.some(x=>x.name==="ccp_compensation_private_series_confirm")).toBe(false);
 }finally{await reader.close();}
 const other=await browser.newContext({baseURL});
 try{
  const visitor=await other.newPage(),neighbor=await delegatedTool(visitor,request);
  expect((await neighbor("ccp_compensation_private_series_review",args)).error?.code).toBe("PRIVATE_SERIES_SCOPE_UNAVAILABLE");
  expect((await visitor.request.get(uri+"?"+new URLSearchParams(args))).status()).toBe(404);
 }finally{await other.close();}
 await page.goto("/coaching");
 await page.getByRole("region",{name:"Compensation agreements"}).getByRole("combobox",{name:"Workplace",exact:true})
  .selectOption(workplaceId,{timeout:15000});
 const panel=page.getByRole("region",{name:"Private recurring coach rates"});
 await panel.getByRole("button",{name:"Load private series"}).press("Enter");
 const roots=panel.getByRole("combobox",{name:"Private recurring series",exact:true});
 await expect(roots.getByRole("option")).toHaveCount(3);
 await roots.selectOption(first);
 await panel.getByRole("button",{name:"Review series and terms"}).press("Enter");
 await panel.getByRole("combobox",{name:"Coach-earning billing account"}).selectOption(billingAccountId);
 await panel.getByRole("spinbutton",{name:"Rate in minor units (ILS)"}).fill("12500");
 await panel.getByLabel("Prospective start date").fill(day);
 await panel.getByLabel("End date (inclusive)").fill(later);
 const termRequest=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===uri);
 page.once("dialog",dialog=>{expect(dialog.message()).toContain(first.slice(0,8));return dialog.accept();});
 await panel.getByRole("button",{name:"Confirm series terms"}).press("Enter");
 const termPayload=(await termRequest).postDataJSON();
 await expect(panel.getByRole("status")).toContainText("No earning was posted");
 expect((await run("ccp_finance_ledger_list",{})).obligations).toEqual([]);
 const approved=(await run("ccp_compensation_private_series_confirm",termPayload)).term;
 const reviewArgs={...args,agreementId:String(approved.id)};
 const preview=await run("ccp_compensation_private_series_review",reviewArgs);
 expect(preview).toEqual(await (await page.request.get(uri+"?"+new URLSearchParams(reviewArgs))).json());
 expect(preview.review.occurrences).toEqual([
   expect.objectContaining({id:occurrence.id,taughtOn:taught,originalOn:day,timezone:"Asia/Jerusalem",expectedAmountCents:12500,state:"ready"}),
   expect.objectContaining({id:priority.id,taughtOn:later,expectedAmountCents:null,state:"exact_terms"}),
 ]);
 expect(JSON.stringify(preview)).not.toContain("Synthetic private attendance notes");
 expect(preview.review.forecastCents).toBe(12500);
 expect(preview.review.occurrences.some((row:{id:string})=>row.id===legacy)).toBe(false);
 expect((await call("ccp_compensation_agreements_get",{agreementId:approved.id})).error?.code).toBe("PRIVATE_SERIES_TERMS_UNAVAILABLE");
 expect((await call("ccp_compensation_agreements_preview",{agreementId:broad.id,from:day,to:later})).error?.code)
  .toBe("PRIVATE_SERIES_PREVIEW_UNAVAILABLE");
 const scoped={action:"post",privateSeriesId:first,agreementId:approved.id,expectedRevision:1,
  expectedAmountCents:12500,sessionId:unrelated.id,taughtOn:day,...key()};
 expect((await call("ccp_compensation_private_series_confirm",{...scoped,sessionId:legacy,taughtOn:taught,...key()})).error?.code)
  .toBe("PRIVATE_SERIES_AGREEMENT_SOURCE_UNVERIFIED");
 expect((await call("ccp_compensation_private_series_confirm",scoped)).error?.code).toBe("PRIVATE_SERIES_AGREEMENT_SOURCE_UNVERIFIED");
 expect((await call("ccp_compensation_private_series_confirm",{...scoped,sessionId:priority.id,taughtOn:later,...key()})).error?.code)
  .toBe("EXACT_AGREEMENT_REVIEW_REQUIRED");
 expect((await page.request.post(uri,{data:{...scoped,confirmed:false},headers:{origin}})).status()).toBe(400);
 await panel.getByRole("combobox",{name:"Series agreement",exact:true}).selectOption(approved.id);
 await panel.getByRole("button",{name:"Review verified earnings"}).press("Enter");
 const completed=panel.getByRole("combobox",{name:"Completed series occurrence"});
 await expect(completed.locator("option:disabled")).toHaveCount(1);
 await completed.selectOption(occurrence.id);
 await expect(panel.getByText("Actual taught date: "+taught,{exact:false})).toBeVisible();
 let firstAckDropped=false;
 await page.route("**"+uri,async route=>{
  if(route.request().method()!=="POST"||firstAckDropped){await route.continue();return;}
  const accepted=await route.fetch();expect(accepted.status(),await accepted.text()).toBe(200);
  firstAckDropped=true;await route.abort();
 });
 const sent=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===uri);
 page.once("dialog",dialog=>{expect(dialog.message()).toContain(taught);return dialog.accept();});
 await panel.getByRole("button",{name:"Approve this coach earning"}).press("Enter");
 const immutable=(await sent).postDataJSON();
 expect(immutable).toMatchObject({privateSeriesId:first,sessionId:occurrence.id,taughtOn:taught});
 const retry=panel.getByRole("button",{name:"Retry identical approval"});
 await expect(retry).toBeVisible();await expect(completed).toBeDisabled();
 const repeated=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===uri);
 await retry.press("Enter");
 expect((await repeated).postDataJSON()).toEqual(immutable);
 await expect(panel.getByRole("status")).toContainText("Previous approval receipt confirmed");
 await expect(panel.getByRole("button",{name:"Approve this coach earning"})).toBeDisabled();
 await page.unroute("**"+uri);
 const replay=await run("ccp_compensation_private_series_confirm",immutable);
 expect(replay).toMatchObject({replayed:true,obligation:{privateSeriesId:first,sessionId:occurrence.id,taughtOn:taught,amountCents:12500}});
 const duplicate=await page.request.post(uri,{data:{...immutable,...key()},headers:{origin}});
 expect(duplicate.status(),await duplicate.text()).toBe(409);
 expect(await duplicate.json()).toEqual({code:"PRIVATE_SERIES_EARNING_ALREADY_POSTED"});
 expect((await call("ccp_compensation_private_series_confirm",{...immutable,...key()})).error?.code)
  .toBe("PRIVATE_SERIES_EARNING_ALREADY_POSTED");
 // Review the second root before another signed client creates overlapping
 // terms. The stale browser remains enabled until the database declines it.
 await roots.selectOption(second);
 const rootReview=panel.getByRole("button",{name:"Review series and terms"});
 await rootReview.press("Enter");
 const payerSelect=panel.getByRole("combobox",{name:"Coach-earning billing account"});
 await payerSelect.selectOption(billingAccountId);
 await panel.getByLabel("End date (inclusive)").fill(day);
 const createTerms=panel.getByRole("button",{name:"Confirm series terms"});
 await expect(createTerms).toBeEnabled();
 const competing={action:"terms",workplaceId,privateSeriesId:second,billingAccountId,currency:"ILS",
  model:"per_session",rateCents:7000,from:day,to:day,...key()};
 const winner=(await run("ccp_compensation_private_series_confirm",competing)).term;
 expect((await call("ccp_compensation_private_series_confirm",{...competing,...key()})).error?.code)
  .toBe("PRIVATE_SERIES_TERMS_OVERLAP");
 page.once("dialog",dialog=>dialog.accept());
 await createTerms.press("Enter");
 await expect(panel.getByRole("alert")).toContainText("Another approval now overlaps these dates");
 await expect(retry).toHaveCount(0);
 await expect(rootReview).toBeEnabled();
 await rootReview.press("Enter");
 await payerSelect.selectOption(billingAccountId);
 await expect(panel.getByText("An active agreement already overlaps these dates.")).toBeVisible();
 await expect(createTerms).toBeDisabled();
 const archivedWinner=await run("ccp_compensation_private_series_confirm",{
  action:"archive",agreementId:winner.id,expectedRevision:winner.revision,...key()});
 expect(archivedWinner.term.status).toBe("archived");
 await rootReview.press("Enter");
 await expect(createTerms).toBeEnabled();
 const archived=(await run("ccp_compensation_private_series_confirm",{action:"terms",workplaceId,privateSeriesId:second,
  billingAccountId,currency:"ILS",model:"per_session",rateCents:4500,from:day,to:day,...key()})).term;
 const archive={action:"archive",agreementId:archived.id,expectedRevision:archived.revision,...key()};
 expect((await run("ccp_compensation_private_series_confirm",archive)).term.status).toBe("archived");
 const archivedReview=await run("ccp_compensation_private_series_review",{workplaceId,privateSeriesId:second,agreementId:archived.id});
 expect(archivedReview.review).toMatchObject({state:"archived",occurrences:[]});
 const retiring=await run("ccp_billing_accounts_create",{displayName:"Synthetic retiring account "+randomUUID(),accountKind:"organization",...key()});
 await rootReview.press("Enter");
 await payerSelect.selectOption(retiring.id);
 await panel.getByLabel("Prospective start date").fill(later);
 await panel.getByLabel("End date (inclusive)").fill(later);
 await expect(createTerms).toBeEnabled();
 await run("ccp_billing_accounts_update",{billingAccountId:retiring.id,status:"archived",expectedRevision:retiring.revision,...key()});
 const inactive={...competing,billingAccountId:retiring.id,from:later,to:later,...key()};
 expect((await call("ccp_compensation_private_series_confirm",inactive)).error?.code)
  .toBe("PRIVATE_SERIES_PAYER_UNAVAILABLE");
 page.once("dialog",dialog=>dialog.accept());
 await createTerms.press("Enter");
 await expect(panel.getByRole("alert")).toContainText("The billing account is no longer available");
 await expect(retry).toHaveCount(0);
 await rootReview.press("Enter");
 await expect(payerSelect.locator('option[value="'+retiring.id+'"]')).toHaveCount(0);

 expect((await run("ccp_finance_ledger_list",{}))).toMatchObject({obligations:[{id:replay.obligation.id,kind:"coach_earning"}],
  receivedPayments:[],allocations:[]});
 expect(priorityTerms.id).toBeTruthy();
});
