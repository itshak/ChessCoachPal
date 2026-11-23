import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: canceled and unattended lessons do not post native earnings; a taught make-up earns once without implying payment",async({page,request,isolatedTeacher})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const origin=new URL(page.url()).origin;
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const result=await call(name,args);
  expect(result.error,name).toBeUndefined();
  return result.data;
 };
 const studentId=String((await run("ccp_students_create",{
  name:"Synthetic make-up finance learner "+randomUUID(),idempotencyKey:randomUUID(),
 })).entityId);
 const workplaceId=String((await run("ccp_workplaces_create",{
  name:"Synthetic make-up finance workplace "+randomUUID(),timezone:"UTC",currency:"ILS",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 })).entityId);
 await run("ccp_workplaces_enroll",{workplaceId,studentId,idempotencyKey:randomUUID()});
 const billingAccountId=String((await run("ccp_billing_accounts_create",{
  displayName:"Synthetic make-up counterparty "+randomUUID(),accountKind:"organization",...key(),
 })).id);
 const agreement=await run("ccp_compensation_agreements_create",{
  workplaceId,billingAccountId,agreementRole:"coach_earning",model:"hourly",
  rateCents:12000,currency:"ILS",effectiveFrom:"2051-04-01",effectiveTo:"2051-04-30",...key(),
 });
 const sourceDay="2051-04-08",makeUpDay="2051-04-09",absentDay="2051-04-10";
 const session=async(date:string,title:string)=>String((await run("ccp_sessions_create",{
  workplaceId,studentId,title,startsAt:date+"T14:00:00Z",durationMinutes:90,idempotencyKey:randomUUID(),
 })).entityId);
 const complete=async(sessionId:string,status:"present"|"absent")=>{
  const details=await run("ccp_sessions_details",{sessionId});
  const preview=await run("ccp_attendance_preview",{sessionId});
  expect(preview.attendance).toHaveLength(1);
  expect(preview.attendance[0].student_id).toBe(studentId);
  await run("ccp_sessions_complete",{
   sessionId,expectedUpdatedAt:details.updated_at,...key(),
   attendance:[{studentId,status,note:"",expectedUpdatedAt:preview.attendance[0].updated_at}],
  });
  expect((await run("ccp_sessions_details",{sessionId})).status).toBe("completed");
 };
 const approve=(sessionId:string,date:string)=>({
  agreementId:agreement.id,expectedRevision:agreement.revision,expectedAmountCents:18000,
  sessionId,studentId:null,periodStart:date,periodEnd:date,...key(),
 });
 const webApprove=(data:Record<string,unknown>)=>page.request.post("/api/finance-ledger/obligations",{headers:{origin},data});
 const readback=async(expectedCount:number,expectedCents:number)=>{
  const scope={workplaceId,billingAccountId,from:sourceDay,to:absentDay,currency:"ILS"};
  const web=await page.request.get("/api/finance-ledger/earnings-summary?"+new URLSearchParams(scope));
  expect(web.status(),await web.text()).toBe(200);
  const summary=await run("ccp_finance_earning_summary",scope);
  expect(summary).toEqual(await web.json());
  expect(summary).toMatchObject({obligationCount:expectedCount,grossPostedCents:expectedCents,
   outstandingCents:expectedCents,netAllocatedReceivedCents:0});
  const ledger=await run("ccp_finance_ledger_list",{});
  expect(ledger.obligations).toHaveLength(expectedCount);
  expect(ledger.receivedPayments).toEqual([]);
  expect(ledger.allocations).toEqual([]);
  return ledger;
 };

 const sourceId=await session(sourceDay,"Teacher-canceled original lesson");
 await run("ccp_session_attendance_set",{
  sessionId:sourceId,studentId,status:"teacher_cancelled",noticeAt:null,
  expectedUpdatedAt:null,notifyFamily:false,note:"Synthetic teacher absence",...key(),
 });
 const credits=await run("ccp_canonical_makeup_credits_list",{});
 expect(credits.credits).toEqual([expect.objectContaining({sourceSessionId:sourceId,studentId,status:"teacher_cancelled"})]);
 const originalDenial=await webApprove(approve(sourceId,sourceDay));
 expect(originalDenial.status(),await originalDenial.text()).toBe(403);
 expect((await originalDenial.json()).code).toBe("COMPLETED_SESSION_NOT_OWNED");
 await readback(0,0);

 const makeup=await run("ccp_private_sessions_create",{
  studentId,workplaceId,date:makeUpDay,time:"10:00",durationMinutes:90,isHomeVisit:false,
  makeupForSessionId:sourceId,...key(),
 });
 expect(makeup).toMatchObject({makeup_for_session_id:sourceId});
 const makeupId=String(makeup.id);
 const scheduled=await call("ccp_finance_obligation_approve",approve(makeupId,makeUpDay));
 expect(scheduled.error?.code).toBe("COMPLETED_SESSION_NOT_OWNED");
 const absent=await session(absentDay,"Actually marked no-show");
 await complete(absent,"absent");
 const noShow=await call("ccp_finance_obligation_approve",approve(absent,absentDay));
 expect(noShow.error?.code).toBe("UNCONFIRMED_OR_NO_SHOW_ATTENDANCE");
 await readback(0,0);

 await complete(makeupId,"present");
 await readback(0,0); // Even documented teaching needs explicit financial approval.
 const input=approve(makeupId,makeUpDay);
 const posting=await run("ccp_finance_obligation_approve",input);
 expect(posting).toMatchObject({replayed:false,obligation:{
  kind:"coach_earning",session_id:makeupId,billing_account_id:billingAccountId,amount_cents:18000,
 }});
 const replay=await webApprove(input);
 expect(replay.status(),await replay.text()).toBe(201);
 expect(await replay.json()).toEqual({...posting,replayed:true});
 const final=await readback(1,18000);
 expect(final.obligations[0]).toMatchObject({id:posting.obligation.id,session_id:makeupId});
});
