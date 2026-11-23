import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: dated compensation preserves posted rates, binds one payer per lesson and posts a full fixed month only",async({page,request,isolatedTeacher})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const origin=new URL(page.url()).origin;
 const approvalEndpoint="/api/finance-ledger/obligations";
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);
  expect(result.error,name).toBeUndefined();
  return result.data;
 };
 const venue=async(name:string)=>String((await run("ccp_workplaces_create",{
  name:name+" "+randomUUID(),timezone:"UTC",currency:"ILS",locale:"en",policy:{},idempotencyKey:randomUUID(),
 })).entityId);
 const account=async(displayName:string,accountKind:"organization"|"person")=>String((await run("ccp_billing_accounts_create",{
  displayName:displayName+" "+randomUUID(),accountKind,...key(),
 })).id);
 const school=await venue("Synthetic school"),privateVenue=await venue("Synthetic private workplace");
 const schoolPayer=await account("School debtor","organization");
 const guardian=await account("Guardian debtor","person");
 const federation=await account("Federation sponsor","organization");
 const pupil=String((await run("ccp_students_create",{name:"Synthetic same learner "+randomUUID(),idempotencyKey:randomUUID()})).entityId);
 for(const workplaceId of [school,privateVenue]){
  await run("ccp_workplaces_enroll",{workplaceId,studentId:pupil,idempotencyKey:randomUUID()});
 }
 const completed=async(workplaceId:string,date:string)=>{
  const scheduled=await run("ccp_sessions_create",{
   workplaceId,studentId:pupil,title:"Synthetic compensation lesson",
   startsAt:date+"T09:00:00Z",durationMinutes:90,idempotencyKey:randomUUID(),
  });
  const sessionId=String(scheduled.entityId);
  const detail=await run("ccp_sessions_details",{sessionId});
  const roster=await run("ccp_attendance_preview",{sessionId});
  expect(roster.attendance).toHaveLength(1);
  expect(roster.attendance[0].student_id).toBe(pupil);
  await run("ccp_sessions_complete",{
   sessionId,expectedUpdatedAt:detail.updated_at,...key(),attendance:[{
    studentId:pupil,status:"present",note:"",expectedUpdatedAt:roster.attendance[0].updated_at,
   }],
  });
  return sessionId;
 };
 const agreement=async(workplaceId:string,billingAccountId:string,rateCents:number,
    effectiveFrom:string,effectiveTo:string|null,terms:Record<string,unknown>={})=>
   run("ccp_compensation_agreements_create",{
    workplaceId,billingAccountId,rateCents,effectiveFrom,effectiveTo,
    agreementRole:"coach_earning",model:"hourly",currency:"ILS",...terms,...key(),
   });
 const approve=(a:{id:string;revision:number},amount:number,sessionId:string|null,
    periodStart:string,periodEnd=periodStart,studentId:string|null=null)=>({
  agreementId:a.id,expectedRevision:a.revision,expectedAmountCents:amount,
  sessionId,studentId,periodStart,periodEnd,...key(),
 });
 const websiteApprove=(data:Record<string,unknown>)=>page.request.post(approvalEndpoint,{headers:{origin},data});

 const oldDay="2049-02-10",newDay="2049-03-10";
 const oldSession=await completed(school,oldDay);
 const newSession=await completed(school,newDay);
 const old=await agreement(school,schoolPayer,12000,"2049-02-01",null);
 const oldInput=approve(old,18000,oldSession,oldDay);
 const oldPosted=await run("ccp_finance_obligation_approve",oldInput);
 expect(oldPosted).toMatchObject({replayed:false,obligation:{amount_cents:18000,agreement_revision:1,
  billing_account_id:schoolPayer,session_id:oldSession}});
 expect(oldPosted.obligation.agreement_snapshot).toMatchObject({rateCents:12000,revision:1});
 const revised=await run("ccp_compensation_agreements_update",{
  id:old.id,expectedRevision:1,changes:{effectiveTo:"2049-02-28"},...key(),
 });
 expect(revised).toMatchObject({revision:2,effectiveTo:"2049-02-28"});
 const next=await agreement(school,schoolPayer,14000,"2049-03-01","2049-04-30");
 const staleDate=await call("ccp_finance_obligation_approve",approve(revised,18000,newSession,newDay));
 expect(staleDate.error?.code).toBe("AGREEMENT_DATE_MISMATCH");
 const nextInput=approve(next,21000,newSession,newDay);
 const webNew=await websiteApprove(nextInput);
 expect(webNew.status(),await webNew.text()).toBe(201);
 const newPosted=await webNew.json();
 expect(newPosted).toMatchObject({replayed:false,obligation:{amount_cents:21000,agreement_id:next.id,
  agreement_snapshot:{rateCents:14000},billing_account_id:schoolPayer,session_id:newSession}});
 const oldReplay=await websiteApprove(oldInput);
 expect(oldReplay.status(),await oldReplay.text()).toBe(201);
 expect(await oldReplay.json()).toEqual({replayed:true,obligation:oldPosted.obligation});
 const earningsScope={workplaceId:school,from:oldDay,to:newDay,currency:"ILS",billingAccountId:schoolPayer};
 const schoolEarnings=await run("ccp_finance_earning_summary",earningsScope);
 expect(schoolEarnings).toMatchObject({obligationCount:2,grossPostedCents:39000,outstandingCents:39000,netAllocatedReceivedCents:0});

 const oldPrivateDay="2049-03-09",sponsorDay="2049-03-12";
 const schoolAssignment=await run("ccp_student_billing_assignments_create",{
  studentId:pupil,workplaceId:school,billingAccountId:schoolPayer,effectiveFrom:"2049-02-01",...key(),
 });
 expect(schoolAssignment.billingAccountId).toBe(schoolPayer);
 const privateAssignment=await run("ccp_student_billing_assignments_create",{
  studentId:pupil,workplaceId:privateVenue,billingAccountId:guardian,effectiveFrom:"2049-03-01",...key(),
 });
 const guardianTerms=await agreement(privateVenue,guardian,8000,"2049-03-01","2049-03-31",{
  agreementRole:"participant_charge",model:"per_student",
 });
 const firstPrivate=await completed(privateVenue,oldPrivateDay);
 const privateInput=approve(guardianTerms,8000,firstPrivate,oldPrivateDay,oldPrivateDay,pupil);
 const currentPrivate=await run("ccp_finance_obligation_approve",privateInput);
 expect(currentPrivate.obligation).toMatchObject({kind:"participant_charge",billing_account_id:guardian,student_id:pupil,session_id:firstPrivate});
 await run("ccp_student_billing_assignments_end",{
  studentId:pupil,assignmentId:privateAssignment.id,expectedRevision:1,effectiveTo:"2049-03-11",...key(),
 });
 await run("ccp_student_billing_assignments_create",{
  studentId:pupil,workplaceId:privateVenue,billingAccountId:federation,
  effectiveFrom:sponsorDay,effectiveTo:sponsorDay,...key(),
 });
 const sponsorTerms=await agreement(privateVenue,federation,9000,sponsorDay,sponsorDay,{
  studentId:pupil,agreementRole:"participant_charge",model:"per_student",
 });
 const sponsored=await completed(privateVenue,sponsorDay);
 const wrong=await websiteApprove(approve(guardianTerms,8000,sponsored,sponsorDay,sponsorDay,pupil));
 expect(wrong.status(),await wrong.text()).toBe(409);
 expect((await wrong.json()).code).toBe("EXPLICIT_PAYER_ASSIGNMENT_REQUIRED");
 const sponsorInput=approve(sponsorTerms,9000,sponsored,sponsorDay,sponsorDay,pupil);
 const sponsor=await run("ccp_finance_obligation_approve",sponsorInput);
 expect(sponsor).toMatchObject({obligation:{kind:"participant_charge",billing_account_id:federation,student_id:pupil,session_id:sponsored},replayed:false});
 const guardianReplay=await websiteApprove(privateInput);
 expect(guardianReplay.status(),await guardianReplay.text()).toBe(201);
 expect(await guardianReplay.json()).toEqual({...currentPrivate,replayed:true});

 const salary=await agreement(school,schoolPayer,60000,"2049-05-01","2049-05-31",{model:"fixed_period"});
 const partialInput=approve(salary,60000,null,"2049-05-02","2049-05-31");
 const partial=await websiteApprove(partialInput);
 expect(partial.status(),await partial.text()).toBe(400);
 expect((await partial.json()).code).toBe("FIXED_PERIOD_MONTH_REQUIRED");
 expect((await call("ccp_finance_obligation_approve",partialInput)).error?.code).toBe("FIXED_PERIOD_MONTH_REQUIRED");
 const salaryInput=approve(salary,60000,null,"2049-05-01","2049-05-31");
 const fixedResponse=await websiteApprove(salaryInput);
 expect(fixedResponse.status(),await fixedResponse.text()).toBe(201);
 const fixed=await fixedResponse.json();
 expect(fixed).toMatchObject({replayed:false,obligation:{kind:"period_compensation",session_id:null,student_id:null,
  amount_cents:60000,billing_account_id:schoolPayer,period_start:"2049-05-01",period_end:"2049-05-31"}});
 expect(await run("ccp_finance_obligation_approve",salaryInput)).toEqual({...fixed,replayed:true});

 const expected=new Map([
  [oldPosted.obligation.id,[schoolPayer,18000]], [newPosted.obligation.id,[schoolPayer,21000]],
  [currentPrivate.obligation.id,[guardian,8000]], [sponsor.obligation.id,[federation,9000]],
  [fixed.obligation.id,[schoolPayer,60000]],
 ]);
 const web=await page.request.get("/api/finance-ledger");
 expect(web.status(),await web.text()).toBe(200);
 const native=await run("ccp_finance_ledger_list",{});
 expect(native).toEqual(await web.json());
 expect(Object.fromEntries(native.obligations.map((x:{id:string;billing_account_id:string;amount_cents:number})=>
  [x.id,[x.billing_account_id,x.amount_cents]]))).toEqual(Object.fromEntries(expected));
 expect(native.receivedPayments).toEqual([]);
 expect(native.allocations).toEqual([]);
 expect(await run("ccp_finance_earning_summary",{...earningsScope,to:"2049-05-31"})).toMatchObject({
  obligationCount:2,grossPostedCents:39000,netAllocatedReceivedCents:0,
 });
 expect(await run("ccp_finance_earning_summary",{workplaceId:privateVenue,from:oldPrivateDay,to:sponsorDay,currency:"ILS"}))
  .toMatchObject({obligationCount:0,grossPostedCents:0});
});
