import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin="http://localhost:3000";

test("PARITY native ledger: confirm a group earning once, record real cash separately, allocate partially and reverse without editing history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplace=await call("ccp_workplaces_create",{
  name:"Finance school "+randomUUID(),timezone:"Asia/Jerusalem",
  currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const school=await call("ccp_billing_accounts_create",{
  displayName:"School counterparty "+randomUUID(),accountKind:"organization",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(school.error).toBeUndefined();
 const billingAccountId=school.data.id as string;
 const studentIds:string[]=[];
 for(let i=0;i<8;i++){
  const learner=await call("ccp_students_create",{
   name:"Ledger group pupil "+i+" "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(learner.error).toBeUndefined();
  const studentId=learner.data.entityId as string;
  studentIds.push(studentId);
  expect((await call("ccp_workplaces_enroll",{
   studentId,workplaceId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const completed=await call("ccp_lessons_capture_completed",{
  workplaceId,studentIds,title:"Finance 90-minute group "+randomUUID(),
  startsAt:"2046-02-05T09:00:00+02:00",durationMinutes:90,
  lessonNote:"One instructor occurrence; no payment implied",
  attendance:studentIds.map(studentId=>({studentId,status:"present",note:""})),
  requestId:randomUUID(),confirmed:true,
 });
 expect(completed.error).toBeUndefined();
 const sessionId=completed.data.sessionId as string;
 expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
 const agreement=await call("ccp_compensation_agreements_create",{
  workplaceId,billingAccountId,agreementRole:"coach_earning",model:"hourly",
  rateCents:12000,currency:"ILS",effectiveFrom:"2046-01-01",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(agreement.error).toBeUndefined();
 const approved={
  agreementId:agreement.data.id as string,expectedRevision:1,
  expectedAmountCents:18000,sessionId,studentId:null,
  periodStart:"2046-02-05",periodEnd:"2046-02-05",
  idempotencyKey:randomUUID(),confirmed:true as const,
 };
 const approval=await call("ccp_finance_obligation_approve",approved);
 expect(approval.error).toBeUndefined();
 const obligationId=approval.data.obligation.id as string;
 expect(approval.data.obligation).toMatchObject({
  kind:"coach_earning",amount_cents:18000,
  billing_account_id:billingAccountId,session_id:sessionId,
 });
 const webReplay=await page.request.post("/api/finance-ledger/obligations",{
  headers:{origin},data:approved,
 });
 expect(webReplay.status(),await webReplay.text()).toBe(201);
 expect((await webReplay.json()).replayed).toBe(true);
 const double=await call("ccp_finance_obligation_approve",{
  ...approved,idempotencyKey:randomUUID(),
 });
 expect(double.error).toBeDefined(); // unique instructor occurrence
 const receipt={
  billingAccountId,currency:"ILS",amountCents:6000,
  receivedAt:new Date().toISOString(),method:"bank_transfer" as const,
  externalReference:"synthetic "+randomUUID(),
  idempotencyKey:randomUUID(),confirmed:true as const,
 };
 const recorded=await page.request.post("/api/finance-ledger/payments",{
  headers:{origin},data:receipt,
 });
 expect(recorded.status(),await recorded.text()).toBe(201);
 const paymentId=(await recorded.json()).payment.id as string;
 const replay=await call("ccp_finance_payment_record",receipt);
 expect(replay.error).toBeUndefined();
 expect(replay.data.replayed).toBe(true);
 const allocation={
  receivedPaymentId:paymentId,obligationId,amountCents:2500,
  idempotencyKey:randomUUID(),confirmed:true as const,
 };
 const allocated=await call("ccp_finance_allocation_record",allocation);
 expect(allocated.error).toBeUndefined();
 const allocationId=allocated.data.allocation.id as string;
 const webAllocation=await page.request.post("/api/finance-ledger/allocations",{
  headers:{origin},data:allocation,
 });
 expect(webAllocation.status(),await webAllocation.text()).toBe(201);
 expect((await webAllocation.json()).replayed).toBe(true);
 const reversal={
  kind:"allocation_reversal" as const,targetId:allocationId,
  amountCents:500,reason:"Correct an erroneously allocated amount",
  idempotencyKey:randomUUID(),confirmed:true as const,
 };
 const reversed=await page.request.post("/api/finance-ledger/reversals",{
  headers:{origin},data:reversal,
 });
 expect(reversed.status(),await reversed.text()).toBe(201);
 expect((await call("ccp_finance_reversal_record",reversal)).data.replayed).toBe(true);
 const refund=await call("ccp_finance_reversal_record",{
  kind:"payment_refund",targetId:paymentId,amountCents:1000,
  reason:"Teacher confirmed money returned outside the app",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(refund.error).toBeUndefined();
 const overRefund=await call("ccp_finance_reversal_record",{
  kind:"payment_refund",targetId:paymentId,amountCents:4000,
  reason:"Must fail because allocation remains outstanding",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(overRefund.error?.code).toBe("PAYMENT_REFUND_EXCEEDS_UNALLOCATED_BALANCE");
 const correction=await call("ccp_finance_reversal_record",{
  kind:"obligation_correction",targetId:obligationId,amountCents:2000,
  reason:"Teacher corrected projected billing amount",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(correction.error).toBeUndefined();
 const web=await page.request.get("/api/finance-ledger");
 expect(web.status(),await web.text()).toBe(200);
 const mcp=await call("ccp_finance_ledger_list",{});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(await web.json());
 expect(mcp.data.obligations.some((o:{id:string})=>o.id===obligationId)).toBe(true);
 expect(mcp.data.receivedPayments.some((p:{id:string})=>p.id===paymentId)).toBe(true);
 expect(mcp.data.reversals).toEqual(expect.arrayContaining([
  expect.objectContaining({kind:"payment_refund",amount_cents:1000}),
  expect.objectContaining({kind:"obligation_correction",amount_cents:2000}),
 ]));
 const readOnly=await delegatedTool(page,request,"coach:read");
 const discovered=await readOnly.listTools();
 expect(discovered.some((t:{name:string})=>t.name==="ccp_finance_ledger_list")).toBe(true);
 expect(discovered.some((t:{name:string})=>t.name==="ccp_finance_payment_record")).toBe(false);
});
