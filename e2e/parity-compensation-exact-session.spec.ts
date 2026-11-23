import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: review exactly one completed lesson for coach terms and never silently fall back",async({page,request,isolatedTeacher})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const origin=new URL(page.url()).origin;
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);expect(result.error,name).toBeUndefined();return result.data;
 };
 const venue=await run("ccp_workplaces_create",{name:"Exact scope school "+randomUUID(),timezone:"UTC",currency:"ILS",idempotencyKey:randomUUID()});
 const workplaceId=String(venue.entityId);
 const otherVenue=await run("ccp_workplaces_create",{
  name:"Other synthetic workplace "+randomUUID(),timezone:"UTC",currency:"ILS",idempotencyKey:randomUUID(),
 });
 const student=await run("ccp_students_create",{name:"Synthetic exact learner "+randomUUID(),idempotencyKey:randomUUID()});
 const studentId=String(student.entityId);
 await run("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()});
 const payer=await run("ccp_billing_accounts_create",{displayName:"Exact counterparty "+randomUUID(),accountKind:"organization",...key()});
 const billingAccountId=String(payer.id),day="2054-04-05";
 const create=async(hour:string,completed:boolean)=>{
  const {entityId:sessionId}=await run("ccp_sessions_create",{
   studentId,workplaceId,title:"Same title test",startsAt:day+"T"+hour+":00:00Z",
   durationMinutes:90,idempotencyKey:randomUUID(),
  });
  if(completed){
   const details=await run("ccp_sessions_details",{sessionId});
   const roster=await run("ccp_attendance_preview",{sessionId});
   await run("ccp_sessions_complete",{sessionId,expectedUpdatedAt:details.updated_at,...key(),attendance:[
    {studentId,status:"present",note:"Synthetic private evidence",expectedUpdatedAt:roster.attendance[0].updated_at},
   ]});
  }
  return String(sessionId);
 };
 const first=await create("09",true),second=await create("11",true),scheduled=await create("13",false);
 const terms={workplaceId,billingAccountId,agreementRole:"coach_earning",model:"hourly",
  effectiveFrom:day,effectiveTo:day,rateCents:12000,currency:"ILS"};
 const broadInput={...terms,...key()};
 const broad=await run("ccp_compensation_agreements_create",broadInput);
 expect(broad.exactSessionId).toBeNull();
 expect((await run("ccp_compensation_agreements_create",broadInput)).replayed).toBe(true);

 const completedPath="/api/compensation-agreements/completed-lessons?";
 const pickerScope={workplaceId,date:day};
 const options=await page.request.get(completedPath+new URLSearchParams(pickerScope));
 expect(options.status(),await options.text()).toBe(200);
 expect(options.headers()["cache-control"]).toBe("no-store");
 const available=await options.json();
 expect(await run("ccp_compensation_completed_lessons",pickerScope)).toEqual(available);
 expect(available.lessons.map((lesson:{id:string})=>lesson.id)).toEqual([first,second]);
 expect(Object.keys(available.lessons[0]).sort()).toEqual(["durationMinutes","id","startsAt","timezone","title"]);
 const missing={workplaceId:randomUUID(),date:day};
 expect((await page.request.get(completedPath+new URLSearchParams(missing))).status()).toBe(404);
 expect((await call("ccp_compensation_completed_lessons",missing)).error?.code).toBe("NOT_FOUND");
 expect((await call("ccp_compensation_agreements_create",{...terms,exactSessionId:scheduled,...key()})).error?.code)
  .toBe("EXACT_AGREEMENT_SCOPE_UNAVAILABLE");

 await page.goto("/coaching");
 const panel=page.getByRole("region",{name:"Compensation agreements"});
 await panel.getByRole("combobox",{name:"Workplace",exact:true}).selectOption(workplaceId,{timeout:15000});
 await panel.getByRole("combobox",{name:"Applies to",exact:true}).selectOption("exact",{timeout:15000});
 await panel.getByLabel("Completed lesson date").fill(day);
 const choices=panel.getByRole("combobox",{name:"One completed lesson",exact:true});
 await expect(choices.getByRole("option")).toHaveCount(3);
 await choices.focus();
 await page.keyboard.press("ArrowDown");
 // The first and second exact identities have the same title, but distinct
 // reference and time; select the reviewed first item using only the keyboard.
 await expect(choices).toHaveValue(first);
 // The global switch refreshes server props without remounting the panel.
 // Keep the new venue read pending and require old rows to disappear immediately.
 let releaseNewRead:()=>void=()=>{};
 const holdNewRead=new Promise<void>(resolve=>{releaseNewRead=resolve;});
 await page.route("**/api/compensation-agreements/completed-lessons?**",async route=>{
  if(new URL(route.request().url()).searchParams.get("workplaceId")===otherVenue.entityId)await holdNewRead;
  await route.continue();
 });
 let releaseContextRead:()=>void=()=>{};
 const holdContextRead=new Promise<void>(resolve=>{releaseContextRead=resolve;});
 let seenContextRead:()=>void=()=>{};
 const contextRead=new Promise<void>(resolve=>{seenContextRead=resolve;});
 await page.route("**/api/teacher/workplace-context",async route=>{
  if(route.request().method()==="GET"){
   seenContextRead();await holdContextRead;
  }
  await route.continue();
 });
 try{
  await page.locator("#global-workplace-switch").selectOption(String(otherVenue.entityId));
  await contextRead;
  await expect(choices).toBeDisabled();
  await expect(choices.getByRole("option")).toHaveCount(1);
  releaseContextRead();
  await expect(panel.getByRole("combobox",{name:"Workplace",exact:true})).toHaveValue(String(otherVenue.entityId));
  await expect(choices.getByRole("option")).toHaveCount(1);
  await expect(choices).toBeDisabled();
  await expect(panel.getByRole("button",{name:"Confirm agreement"})).toBeDisabled();
 }finally{releaseContextRead();releaseNewRead();}
 await page.unroute("**/api/teacher/workplace-context");
 await expect(panel.getByRole("status").filter({hasText:"No completed lessons match this workplace and date."})).toBeVisible();
 await page.locator("#global-workplace-switch").selectOption(workplaceId);
 await expect(panel.getByRole("combobox",{name:"Workplace",exact:true})).toHaveValue(workplaceId);
 await expect(choices.getByRole("option")).toHaveCount(3);
 await expect(choices).toHaveValue("");
 await choices.focus();
 await page.keyboard.press("ArrowDown");
 await expect(choices).toHaveValue(first);
 await page.unroute("**/api/compensation-agreements/completed-lessons?**");
 await panel.getByRole("combobox",{name:"Billing account",exact:true}).selectOption(billingAccountId,{timeout:15000});
 const add=panel.getByRole("button",{name:"Confirm agreement"});
 const requestBody=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname==="/api/compensation-agreements");
 let dropped=false;
 await page.route("**/api/compensation-agreements",async route=>{
  if(route.request().method()!=="POST"||dropped){await route.continue();return;}
  dropped=true;
  const committed=await route.fetch();
  expect(committed.status()).toBe(201);
  await route.abort();
 });
 page.once("dialog",dialog=>{
  expect(dialog.message()).toContain(first.slice(0,8));
  return dialog.accept();
 });
 await add.focus();
 await page.keyboard.press("Enter");
 const body=(await requestBody).postDataJSON();
 expect(body).toMatchObject({workplaceId,exactSessionId:first,effectiveFrom:day,effectiveTo:day});
 const retry=panel.getByRole("button",{name:"Retry reviewed agreement"});
 await expect(retry).toBeVisible();
 await expect(panel.getByLabel("Completed lesson date")).toBeDisabled();
 const replayRequest=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname==="/api/compensation-agreements");
 await retry.focus();
 await page.keyboard.press("Enter");
 expect((await replayRequest).postDataJSON()).toEqual(body);
 await expect(retry).toHaveCount(0);
 await page.unroute("**/api/compensation-agreements");
 const listPath="/api/compensation-agreements?workplaceId="+workplaceId;
 let exact:{id:string;revision:number}|undefined;
 await expect.poll(async()=>{
  const list=await page.request.get(listPath);
  const json=await list.json();
  exact=json.find((row:{exactSessionId:string})=>row.exactSessionId===first);
  return Boolean(exact);
 }).toBe(true);
 const chosen=exact!;
 const replay=await run("ccp_compensation_agreements_create",body);
 expect(replay).toMatchObject({id:chosen.id,exactSessionId:first,replayed:true});
 const preview=async(agreementId:string)=>{
  const web=await page.request.get(`/api/compensation-agreements/${agreementId}/preview?from=${day}&to=${day}`);
  expect(web.status(),await web.text()).toBe(200);
  const model=await run("ccp_compensation_agreements_preview",{agreementId,from:day,to:day});
  expect(model).toEqual(await web.json());
  return model;
 };
 expect(await preview(broad.id)).toMatchObject({excludedExactSessionCount:1,projection:{expectedCents:18000,eligibleSessionCount:1}});
 expect(await preview(chosen.id)).toMatchObject({excludedExactSessionCount:0,projection:{expectedCents:18000,eligibleSessionCount:1}});
 const before=await run("ccp_finance_ledger_list",{});
 expect(before.obligations).toEqual([]);

 const savedVenue=(await run("ccp_workplaces_list",{})).find((row:{id:string})=>row.id===workplaceId);
 expect(savedVenue).toBeDefined();
 await run("ccp_workplaces_update",{workplaceId,expectedUpdatedAt:savedVenue.updated_at,currency:"USD",idempotencyKey:randomUUID()});
 const updated=await run("ccp_compensation_agreements_update",{id:chosen.id,expectedRevision:1,changes:{rateCents:14000},...key()});
 expect(updated).toMatchObject({exactSessionId:first,currency:"ILS",rateCents:14000,revision:2});
 const approval=(agreementId:string,expectedRevision:number,sessionId:string,expectedAmountCents:number)=>({
  agreementId,expectedRevision,sessionId,expectedAmountCents,studentId:null,periodStart:day,periodEnd:day,...key(),
 });
 const webSubmit=(data:Record<string,unknown>)=>page.request.post("/api/finance-ledger/obligations",{data,headers:{origin}});
 const denied=await webSubmit(approval(broad.id,1,first,18000));
 expect(denied.status(),await denied.text()).toBe(409);
 expect((await denied.json()).code).toBe("EXACT_AGREEMENT_REVIEW_REQUIRED");
 expect((await call("ccp_finance_obligation_approve",approval(chosen.id,2,second,21000))).error?.code)
  .toBe("EXACT_AGREEMENT_SESSION_MISMATCH");
 const selectedInput=approval(chosen.id,updated.revision,first,21000);
 const exactPost=await run("ccp_finance_obligation_approve",selectedInput);
 expect(exactPost.obligation).toMatchObject({session_id:first,amount_cents:21000,agreement_snapshot:{scope:"exact_session",exactSessionId:first}});
 const broadPost=await run("ccp_finance_obligation_approve",approval(broad.id,1,second,18000));
 expect(broadPost.obligation).toMatchObject({session_id:second,amount_cents:18000});
 await run("ccp_compensation_agreements_update",{id:chosen.id,expectedRevision:2,changes:{status:"archived"},...key()});
 const same=await webSubmit(selectedInput);
 expect(same.status(),await same.text()).toBe(201);
 expect(await same.json()).toEqual({...exactPost,replayed:true});
 const ledger=await run("ccp_finance_ledger_list",{});
 expect(ledger.obligations).toHaveLength(2);
 expect(ledger.receivedPayments).toEqual([]);
 expect(ledger.allocations).toEqual([]);
 // Give a separately approved new agreement a real persisted latest revision
 // from MCP before its lost-ack retry. The original request stays fixed.
 const third=await create("16",true);
 await page.reload();
 await panel.getByRole("combobox",{name:"Applies to",exact:true}).selectOption("exact",{timeout:15000});
 await panel.getByLabel("Completed lesson date").fill(day);
 await expect(choices.getByRole("option")).toHaveCount(4);
 await choices.selectOption(third);
 await panel.getByRole("combobox",{name:"Billing account",exact:true}).selectOption(billingAccountId);
 let intercepted=false;
 await page.route("**/api/compensation-agreements",async route=>{
  if(route.request().method()!=="POST"||intercepted){await route.continue();return;}
  intercepted=true;
  const accepted=await route.fetch();
  expect(accepted.status()).toBe(201);
  await route.abort();
 });
 page.once("dialog",dialog=>dialog.accept());
 const lost=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname==="/api/compensation-agreements");
 await add.click();
 const acceptedRequest=(await lost).postDataJSON();
 await expect(retry).toBeVisible();
 await run("ccp_compensation_agreements_update",{
  id:acceptedRequest.idempotencyKey,expectedRevision:1,changes:{rateCents:12500},...key(),
 });
 const conflictRequest=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname==="/api/compensation-agreements");
 await retry.click();
 expect((await conflictRequest).postDataJSON()).toEqual(acceptedRequest);
 await expect(panel.getByText("This request may have been saved and then revised.",{exact:false})).toBeVisible();
 await expect(choices).toBeDisabled();
 await expect(add).toBeDisabled();
 let revisions=await run("ccp_compensation_agreements_list",{workplaceId,includeArchived:true});
 revisions=revisions.filter((row:{exactSessionId:string})=>row.exactSessionId===third);
 expect(revisions).toHaveLength(1);
 expect(revisions[0]).toMatchObject({id:acceptedRequest.idempotencyKey,revision:2,rateCents:12500});
 const final=await run("ccp_finance_ledger_list",{});
 expect(final.obligations).toEqual(ledger.obligations);
 expect(final.receivedPayments).toEqual([]);
});
