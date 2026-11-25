import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-professional-period-end-actuals separates approved earnings, periodic compensation and participant charges",async({page,request,browser,isolatedTeacher})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);
  expect(result.error,name).toBeUndefined();
  return result.data;
 };
 const venue=async(name:string,currency="ILS")=>String((await run("ccp_workplaces_create",{
  name:name+" "+randomUUID(),timezone:"Asia/Jerusalem",currency,locale:"en",policy:{},idempotencyKey:randomUUID(),
 })).entityId);
 const payer=async(displayName:string,accountKind:"organization"|"person")=>String((await run("ccp_billing_accounts_create",{
  displayName:displayName+" "+randomUUID(),accountKind,...key(),
 })).id);
 const workplaceId=await venue("Synthetic approved month"),otherWorkplace=await venue("Synthetic other venue");
 const foreignCurrencyVenue=await venue("Synthetic USD venue","USD");
 const billingAccountId=await payer("Synthetic school","organization"),guardian=await payer("Synthetic guardian","person");
 const studentId=String((await run("ccp_students_create",{name:"Synthetic learner "+randomUUID(),idempotencyKey:randomUUID()})).entityId);
 for(const workplace of [workplaceId,otherWorkplace,foreignCurrencyVenue]){
  await run("ccp_workplaces_enroll",{workplaceId:workplace,studentId,idempotencyKey:randomUUID()});
 }
 const monthStart="2048-02-01",monthEnd="2048-02-29";
 const lesson=async(venueId:string,date:string,time:string)=>{
  const sessionId=String((await run("ccp_sessions_create",{
   workplaceId:venueId,studentId,title:"Synthetic settlement lesson",
   startsAt:date+"T"+time+":00+02:00",durationMinutes:90,idempotencyKey:randomUUID(),
  })).entityId);
  const detail=await run("ccp_sessions_details",{sessionId});
  const roster=await run("ccp_attendance_preview",{sessionId});
  expect(roster.attendance).toHaveLength(1);
  expect(roster.attendance[0].student_id).toBe(studentId);
  await run("ccp_sessions_complete",{sessionId,expectedUpdatedAt:detail.updated_at,...key(),
   attendance:[{studentId,status:"present",note:"",expectedUpdatedAt:roster.attendance[0].updated_at}]});
  return sessionId;
 };
 const create=async(venueId:string,accountId:string,model:string,rateCents:number,currency="ILS",effectiveFrom=monthStart,effectiveTo:string|null=null,charge=false)=>
  run("ccp_compensation_agreements_create",{workplaceId:venueId,billingAccountId:accountId,
   model,rateCents,currency,effectiveFrom,effectiveTo,agreementRole:charge?"participant_charge":"coach_earning",...key()});
 const approve=async(agreement:{id:string;revision:number},expectedAmountCents:number,sessionId:string|null,
  periodStart:string,periodEnd=periodStart,learner:string|null=null)=>
   (await run("ccp_finance_obligation_approve",{agreementId:agreement.id,expectedRevision:agreement.revision,
    expectedAmountCents,sessionId,studentId:learner,periodStart,periodEnd,...key()})).obligation;
 const teach=await create(workplaceId,billingAccountId,"hourly",12000,"ILS",monthStart,monthEnd);
 const first=await lesson(workplaceId,monthStart,"00:30");
 const earning=await approve(teach,18000,first,monthStart);
 const march=await create(workplaceId,billingAccountId,"hourly",12000,"ILS","2048-03-01","2048-03-01");
 await approve(march,18000,await lesson(workplaceId,"2048-03-01","10:00"),"2048-03-01");
 const usd=await create(foreignCurrencyVenue,billingAccountId,"hourly",12000,"USD",monthStart,monthEnd);
 await approve(usd,18000,await lesson(foreignCurrencyVenue,monthEnd,"10:00"),monthEnd);
 const cross=await create(otherWorkplace,billingAccountId,"hourly",12000);
 const crossEntry=await approve(cross,18000,await lesson(otherWorkplace,monthEnd,"14:00"),monthEnd);
 await run("ccp_student_billing_assignments_create",{studentId,workplaceId,billingAccountId:guardian,effectiveFrom:monthStart,...key()});
 const charge=await create(workplaceId,guardian,"per_student",8000,"ILS",monthStart,monthEnd,true);
 await approve(charge,8000,first,monthStart,monthStart,studentId);
 await run("ccp_compensation_agreements_update",{id:teach.id,expectedRevision:teach.revision,changes:{status:"archived"},...key()});
 const salary=await create(workplaceId,billingAccountId,"fixed_period",60000,"ILS",monthStart,monthEnd);
 await approve(salary,60000,null,monthStart,monthEnd);

 const receipt=(await run("ccp_finance_payment_record",{billingAccountId,currency:"ILS",amountCents:100000,
  receivedAt:new Date().toISOString(),method:"bank_transfer",externalReference:"Synthetic receipt only",...key()})).payment;
 const apply=async(obligationId:string,amountCents:number)=>(await run("ccp_finance_allocation_record",{
  receivedPaymentId:receipt.id,obligationId,amountCents,...key(),
 })).allocation;
 const allocation=await apply(earning.id,8000);
 await apply(crossEntry.id,1000);
 for(const [kind,targetId,amountCents] of [
  ["allocation_reversal",allocation.id,2000],["obligation_correction",earning.id,1000],
 ] as const){
  await run("ccp_finance_reversal_record",{kind,targetId,amountCents,reason:"Synthetic reviewed correction",...key()});
 }

 const tool="ccp_finance_period_end_actuals";
 const scope={workplaceId,monthStart,currency:"ILS"};
 const path=(args:Record<string,string>)=>"/api/finance-ledger/period-end-actuals?"+new URLSearchParams(args);
 const before=await run("ccp_finance_ledger_list",{});
 const response=await page.request.get(path(scope));
 expect(response.status(),await response.text()).toBe(200);
 expect(response.headers()["cache-control"]).toBe("no-store");
 const result=await run(tool,scope);
 expect(result).toEqual(await response.json());
 expect(result).toMatchObject({...scope,monthEnd,settlementBasis:"current",billingAccountId:null});
 expect(result.categories).toEqual([
  {kind:"coach_earning",obligationCount:1,grossPostedCents:18000,correctionCents:1000,correctedPostedCents:17000,netAppliedCents:6000,outstandingCents:11000},
  {kind:"period_compensation",obligationCount:1,grossPostedCents:60000,correctionCents:0,correctedPostedCents:60000,netAppliedCents:0,outstandingCents:60000},
  {kind:"participant_charge",obligationCount:1,grossPostedCents:8000,correctionCents:0,correctedPostedCents:8000,netAppliedCents:0,outstandingCents:8000},
 ]);
 const scoped={...scope,billingAccountId};
 expect((await run(tool,scoped)).categories[2].obligationCount).toBe(0);
 expect((await run(tool,{...scope,workplaceId:otherWorkplace})).categories[0].netAppliedCents).toBe(1000);
 expect((await run(tool,{...scope,currency:"USD"})).categories.every((row:{obligationCount:number})=>row.obligationCount===0)).toBe(true);
 expect((await run(tool,{...scope,workplaceId:foreignCurrencyVenue,currency:"USD"})).categories[0].grossPostedCents).toBe(18000);
 expect((await request.get(path(scope))).status()).toBe(401);
 expect((await page.request.get(path(scope)+"&currency=USD")).status()).toBe(400);
 expect((await page.request.get(path({...scope,monthStart:monthEnd}))).status()).toBe(400);
 expect((await call(tool,{...scope,billingAccountId:randomUUID()})).error?.code).toBe("PERIOD_END_ACTUALS_SCOPE_NOT_OWNED");
 const readOnlyPage=await browser.newPage({baseURL:new URL(page.url()).origin});
 try{
  const view=await delegatedTool(readOnlyPage,request,"coach:read",isolatedTeacher);
  expect((await view.listTools()).some(entry=>entry.name===tool)).toBe(true);
  expect((await view(tool,scope)).data).toEqual(result);
 }finally{await readOnlyPage.close();}

 await page.setViewportSize({width:320,height:780});
 await page.goto("/billing");
 const open=page.getByRole("button",{name:"Review month-end settlement"});
 await open.focus();await page.keyboard.press("Enter");
 const panel=page.getByRole("region",{name:"Month-end settlement"});
 await panel.getByLabel("Workplace").selectOption(workplaceId);
 await panel.getByLabel("Obligation month").fill("2048-02");
 await panel.getByLabel("Currency").fill("ILS");
 await panel.getByRole("button",{name:"Show settlement"}).focus();await page.keyboard.press("Enter");
 const earnings=panel.getByRole("region",{name:"Coaching earnings"});
 await expect(earnings.getByText(/ILS\s+110\.00/)).toBeVisible();
 await expect(panel.getByRole("region",{name:"Fixed-period compensation"})).toBeVisible();
 await expect(panel.getByRole("region",{name:"Participant charges"})).toBeVisible();
 expect(await run("ccp_finance_ledger_list",{})).toEqual(before);
});
