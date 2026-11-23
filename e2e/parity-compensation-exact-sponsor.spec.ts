import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: exact participant sponsorship keeps review, posting and cash separate",async({page,request,browser,baseURL,isolatedTeacher})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const origin=new URL(page.url()).origin;
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(tool:string,args:Record<string,unknown>)=>{
  const out=await call(tool,args);expect(out.error,tool).toBeUndefined();return out.data;
 };
 const workplaceId=(await run("ccp_workplaces_create",{name:"Sponsor test venue "+randomUUID(),
  timezone:"UTC",currency:"ILS",idempotencyKey:randomUUID()})).entityId;
 const name="Sponsor test learner "+randomUUID();
 const studentId=(await run("ccp_students_create",{name,idempotencyKey:randomUUID()})).entityId;
 await run("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()});
 const otherName="Other attendee "+randomUUID();
 const otherStudent=(await run("ccp_students_create",{name:otherName,idempotencyKey:randomUUID()})).entityId;
 const groupId=(await run("ccp_groups_create",{workplaceId,name:"Sponsor proof group",idempotencyKey:randomUUID()})).entityId;
 await run("ccp_groups_enroll",{groupId,studentId,idempotencyKey:randomUUID()});
 await run("ccp_groups_enroll",{groupId,studentId:otherStudent,idempotencyKey:randomUUID()});
 const payer="Sponsor test account "+randomUUID();
 const billingAccountId=(await run("ccp_billing_accounts_create",{displayName:payer,accountKind:"organization",...key()})).id;
 const day="2055-04-05";
 const separatePayer=(await run("ccp_billing_accounts_create",{displayName:"Unrelated dated payer "+randomUUID(),
  accountKind:"person",...key()})).id;
 const defaultPayer=(await run("ccp_billing_accounts_create",{displayName:"Ordinary dated payer "+randomUUID(),
  accountKind:"person",...key()})).id;
 for(const [learner,account] of [[studentId,defaultPayer],[otherStudent,separatePayer]]){
  await run("ccp_student_billing_assignments_create",{studentId:learner,workplaceId,billingAccountId:account,effectiveFrom:day,...key()});
  const rate=await page.request.put("/api/students/"+learner,{data:{defaultRateCents:8000}});
  expect(rate.status(),await rate.text()).toBe(200);
 }

 const createLesson=async(hour:string,group=false,learner=studentId)=>{
  const sessionId=(await run("ccp_sessions_create",{...(group?{groupId}:{studentId:learner}),workplaceId,title:"Sponsored lesson",
   startsAt:day+"T"+hour+":00:00Z",durationMinutes:60,idempotencyKey:randomUUID()})).entityId;
  const details=await run("ccp_sessions_details",{sessionId}),roster=await run("ccp_attendance_preview",{sessionId});
  await run("ccp_sessions_complete",{sessionId,expectedUpdatedAt:details.updated_at,...key(),
   attendance:roster.attendance.map((a:{student_id:string;updated_at:string})=>({studentId:a.student_id,status:"present",note:"Synthetic private evidence",expectedUpdatedAt:a.updated_at}))});
  return sessionId;
 };
 const unrelatedSession=await createLesson("13",false,otherStudent);
 const preexisting=await page.request.post("/api/billing/generate",{headers:{origin},
  data:{periodStart:day,periodEnd:day,commit:true,idempotencyKey:randomUUID()}});
 expect(preexisting.status(),await preexisting.text()).toBe(200);
 const unrelatedInvoice=(await preexisting.json()).created[0];
 const sessionId=await createLesson("09",true);
 const nextId=await createLesson("11");
 const url="/api/compensation-agreements/exact-sponsor",review={workplaceId,sessionId,day};
 const webRead=await page.request.get(url+"?"+new URLSearchParams(review));
 expect(webRead.status(),await webRead.text()).toBe(200);
 expect(webRead.headers()["cache-control"]).toBe("no-store");
 const read=await run("ccp_compensation_exact_sponsor_review",review);
 expect(read).toEqual(await webRead.json());
 expect(read.participants).toEqual(expect.arrayContaining([{id:studentId,name,activeAgreement:null,automaticBillingReviewRequired:false},{id:otherStudent,name:otherName,activeAgreement:null,automaticBillingReviewRequired:false}]));
 expect(JSON.stringify(read)).not.toContain("Synthetic private evidence");
 const wrong=await page.request.get(url+"?"+new URLSearchParams({...review,day:"2055-04-06"}));
 expect(wrong.status()).toBe(404);
 const input={action:"create",...review,studentId,billingAccountId,currency:"ILS",model:"per_session",rateCents:18000,...key()};
 const readerContext=await browser.newContext({baseURL});
 try{
  const reader=await delegatedTool(await readerContext.newPage(),request,"coach:read",isolatedTeacher);
  const tools=await reader.listTools();
  expect(tools.find(x=>x.name==="ccp_compensation_exact_sponsor_review")?.inputSchema?.type).toBe("object");
  expect(tools.some(x=>x.name==="ccp_compensation_exact_sponsor_commit")).toBe(false);
  expect((await reader("ccp_compensation_exact_sponsor_commit",input)).error?.code).toBe("FORBIDDEN");
 }finally{await readerContext.close();}
 const foreignContext=await browser.newContext({baseURL});
 try{
  const foreignPage=await foreignContext.newPage(),foreign=await delegatedTool(foreignPage,request);
  expect((await foreign("ccp_compensation_exact_sponsor_review",review)).error?.code).toBe("EXACT_AGREEMENT_SCOPE_UNAVAILABLE");
  expect((await foreignPage.request.get(url+"?"+new URLSearchParams(review))).status()).toBe(404);
 }finally{await foreignContext.close();}
 const wrongOrigin=await page.request.post(url,{data:input});
 expect(wrongOrigin.status()).toBe(403);
 await page.goto("/coaching");
 await page.getByRole("region",{name:"Compensation agreements"}).getByRole("combobox",{name:"Workplace",exact:true})
  .selectOption(workplaceId,{timeout:15000});
 const panel=page.getByRole("region",{name:"Single-lesson participant sponsorship"});
 await panel.getByLabel("Lesson date",{exact:true}).fill(day);
 await panel.getByRole("button",{name:"Find completed lessons"}).press("Enter");
 const choices=panel.getByRole("combobox",{name:"Completed lesson",exact:true});
 await expect(choices.getByRole("option")).toHaveCount(4);
 await choices.focus();await page.keyboard.press("ArrowDown");
 await expect(choices).toHaveValue(sessionId);
 await panel.getByRole("button",{name:"Review participant and payer choices"}).press("Enter");
 await expect(panel.getByText("Actual lesson date: 2055-04-05 (UTC)")).toBeVisible();
 await panel.getByRole("combobox",{name:"Frozen lesson participant"}).selectOption(studentId);
 await panel.getByRole("combobox",{name:"Active billing account"}).selectOption(billingAccountId);
 await panel.getByRole("spinbutton",{name:"Amount in minor units (ILS)"}).fill("18000");
 let dropped=false;
 await page.route("**"+url,async route=>{
  if(route.request().method()!=="POST"||dropped){await route.continue();return;}
  const accepted=await route.fetch();expect(accepted.status(),await accepted.text()).toBe(200);
  dropped=true;await route.abort();
 });
 const sent=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===url);
 const warning="permanently puts automatic invoicing and prepaid credits";
 await expect(panel.getByText(warning,{exact:false})).toBeVisible();
 page.once("dialog",dialog=>{
  expect(dialog.message()).toContain(payer);expect(dialog.message()).toContain(warning);
  return dialog.accept();
 });
 await panel.getByRole("button",{name:"Approve exact sponsorship"}).press("Enter");
 const exact=(await sent).postDataJSON();
 expect(exact).toMatchObject({action:"create",...review,studentId,billingAccountId,rateCents:18000});
 const retry=panel.getByRole("button",{name:"Retry identical approval"});
 await expect(retry).toBeVisible();await expect(choices).toBeDisabled();
 const sentRetry=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===url);
 await retry.press("Enter");
 expect((await sentRetry).postDataJSON()).toEqual(exact);
 await expect(panel.getByRole("status")).toContainText("Previous approval receipt confirmed");
 await page.unroute("**"+url);
 const replay=await run("ccp_compensation_exact_sponsor_commit",exact);
 expect(replay).toMatchObject({replayed:true,status:"active",exactSessionId:sessionId,studentId,billingAccountId});
 expect((await run("ccp_compensation_exact_sponsor_review",{...review,sessionId:nextId})).participants[0])
  .toMatchObject({automaticBillingReviewRequired:false});
 const earning=(await run("ccp_compensation_agreements_create",{workplaceId,billingAccountId:defaultPayer,
  agreementRole:"coach_earning",model:"per_session",rateCents:10000,currency:"ILS",
  effectiveFrom:day,effectiveTo:day,...key()})).id;
 expect((await run("ccp_compensation_agreements_preview",{agreementId:earning,from:day,to:day})).projection)
  .toMatchObject({expectedCents:30000,eligibleSessionCount:3});
 const original=await page.request.get("/api/billing/invoices/"+unrelatedInvoice);
 expect(original.status(),await original.text()).toBe(200);
 const invoice=await original.json();
 const regenerated=await run("ccp_billing_invoice_regenerate",{invoiceId:unrelatedInvoice,expectedUpdatedAt:invoice.updated_at,...key()});
 expect(regenerated.subtotalCents).toBe(16000);
 const updated=await page.request.get("/api/billing/invoices/"+unrelatedInvoice);
 const lines=(await updated.json()).invoice_items as {session_id:string;student_id:string}[];
 expect(lines).toHaveLength(2);
 expect(lines.map(x=>x.student_id)).toEqual([otherStudent,otherStudent]);
 expect(lines.map(x=>x.session_id).sort()).toEqual([unrelatedSession,sessionId].sort());
 const blocked=()=>page.request.post("/api/billing/generate",{headers:{origin},data:{periodStart:day,periodEnd:day,commit:false}});
 const preview=await blocked();expect(preview.status(),await preview.text()).toBe(409);
 expect((await preview.json()).code).toBe("EXACT_SPONSOR_REVIEW_REQUIRED");
 expect((await call("ccp_billing_generation_preview",{periodStart:day,periodEnd:day})).error?.code).toBe("EXACT_SPONSOR_REVIEW_REQUIRED");
 expect(await run("ccp_finance_ledger_list",{})).toMatchObject({obligations:[],receivedPayments:[],allocations:[]});
 const posted=await run("ccp_finance_obligation_approve",{agreementId:replay.agreementId,
  expectedRevision:replay.revision,sessionId,studentId,expectedAmountCents:18000,periodStart:day,periodEnd:day,...key()});
 expect(posted.obligation).toMatchObject({session_id:sessionId,student_id:studentId,billing_account_id:billingAccountId,
  amount_cents:18000,kind:"participant_charge"});
 expect((await run("ccp_finance_ledger_list",{})).receivedPayments).toEqual([]);
 const receipt={billingAccountId,currency:"ILS",amountCents:5000,receivedAt:new Date().toISOString(),method:"cash",...key()};
 const record=await page.request.post("/api/finance-ledger/payments",{headers:{origin},data:receipt});
 expect(record.status(),await record.text()).toBe(201);
 const payment=(await record.json()).payment;
 expect((await run("ccp_finance_payment_record",receipt)).replayed).toBe(true);
 expect((await run("ccp_finance_ledger_list",{})).allocations).toEqual([]);
 const allocate={receivedPaymentId:payment.id,obligationId:posted.obligation.id,amountCents:5000,...key()};
 expect((await run("ccp_finance_allocation_record",allocate)).allocation).toMatchObject({amount_cents:5000});
 const ledger=await run("ccp_finance_ledger_list",{});
 expect(ledger.allocations).toHaveLength(1);
 expect(ledger.receivedPayments).toHaveLength(1);
 await run("ccp_compensation_exact_sponsor_commit",{action:"archive",agreementId:replay.agreementId,expectedRevision:replay.revision,...key()});
 const archived=await run("ccp_compensation_exact_sponsor_review",review);
 expect(archived.participants).toEqual(expect.arrayContaining([{id:studentId,name,activeAgreement:null,automaticBillingReviewRequired:true},{id:otherStudent,name:otherName,activeAgreement:null,automaticBillingReviewRequired:false}]));
 expect((await blocked()).status()).toBe(409);
 // A distinct signed client archives the second approval after the request
 // commits but before Chromium can receive its original acknowledgment.
 await choices.selectOption(nextId);
 await panel.getByRole("button",{name:"Review participant and payer choices"}).press("Enter");
 await panel.getByRole("combobox",{name:"Frozen lesson participant"}).selectOption(studentId);
 await panel.getByRole("combobox",{name:"Active billing account"}).selectOption(billingAccountId);
 let archivedBeforeRetry=false;
 await page.route("**"+url,async route=>{
  if(route.request().method()!=="POST"||archivedBeforeRetry){await route.continue();return;}
  const completed=await route.fetch();
  expect(completed.status(),await completed.text()).toBe(200);
  const terms=await completed.json();
  await run("ccp_compensation_exact_sponsor_commit",{action:"archive",agreementId:terms.agreementId,
   expectedRevision:terms.revision,...key()});
  archivedBeforeRetry=true;
  await route.abort();
 });
 page.once("dialog",dialog=>dialog.accept());
 await panel.getByRole("button",{name:"Approve exact sponsorship"}).press("Enter");
 await expect(retry).toBeVisible();
 await expect(choices).toBeDisabled();
 await retry.press("Enter");
 await expect(panel.getByRole("status")).toContainText("Previous approval receipt confirmed");
 await expect(panel.getByText("even after sponsorship is archived",{exact:false})).toBeVisible();
 await expect(panel.getByRole("button",{name:"Archive exact sponsorship"})).toHaveCount(0);
 await expect(panel.getByRole("button",{name:"Approve exact sponsorship"})).toBeVisible();
 expect(archivedBeforeRetry).toBe(true);
 await page.unroute("**"+url);

});
