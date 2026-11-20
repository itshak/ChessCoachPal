import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createAssignedPayer} from "./helpers/canonical-payer";

test("PARITY:PARITY-credit-adjustment-review proves website and MCP funding, grant, forfeiture and idempotency",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const learner=await call("ccp_students_create",{
  name:"Adjustment learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const campus=await call("ccp_workplaces_create",{
  name:"Adjustment campus "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(campus.error).toBeUndefined();
 const workplaceId=campus.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 await createAssignedPayer(call,{workplaceId,studentId,effectiveFrom:"2040-01-01"});
 const purchased=await call("ccp_credits_package_create",{
  studentId,workplaceId,credits:3,durationMinutes:45,priceCents:7500,
  startsOn:"2042-01-01",expiresOn:"2042-12-31",
  requestId:randomUUID(),confirmed:true,
 });
 expect(purchased.error).toBeUndefined();
 const packageId=purchased.data.packageId as string;
 const webPreview=await page.request.post("/api/agent/v1",{data:{
  action:"credits.adjustmentPreview",packageId,
 }});
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const before=(await webPreview.json()).data;
 const modelPreview=await call("ccp_credits_adjustment_preview",{packageId});
 expect(modelPreview.error).toBeUndefined();
 expect(modelPreview.data).toEqual(before);
 expect(before).toMatchObject({
  availableCredits:3,redeemedCredits:0,adjustmentCredits:0,
  invoiceStatus:"draft",fullyFunded:false,receivedOnInvoiceCents:0,
 });
 // A confirmed grant is a noncash teacher concession, not an implicit
 // payment, refund, transfer or a made-up paid invoice.
 const grant={packageId,kind:"manual_grant",credits:2,expectedBalance:3,
  requestId:randomUUID(),confirmed:true,
  reason:"Teacher approved two goodwill training credits without collecting cash",
 };
 const siteGrant=await page.request.post("/api/agent/v1",{data:{
  action:"credits.adjustmentCommit",...grant,
 }});
 expect(siteGrant.status(),await siteGrant.text()).toBe(200);
 const grantReceipt=(await siteGrant.json()).data;
 expect(grantReceipt).toMatchObject({
  balanceBefore:3,balanceAfter:5,cashMoved:false,replayed:false,
 });
 const retry=await call("ccp_credits_adjustment_commit",grant);
 expect(retry.error).toBeUndefined();
 expect(retry.data).toMatchObject({
  eventId:grantReceipt.eventId,balanceAfter:5,replayed:true,
 });
 const changedTerms=await call("ccp_credits_adjustment_commit",{
  ...grant,credits:1,
 });
 expect(changedTerms.error?.code).toBe("CONFLICT");
 const stale=await call("ccp_credits_adjustment_commit",{
  ...grant,requestId:randomUUID(),expectedBalance:3,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const afterGrant=await call("ccp_credits_adjustment_preview",{packageId});
 expect(afterGrant.error).toBeUndefined();
 expect(afterGrant.data.availableCredits).toBe(5);
 expect(afterGrant.data.fullyFunded).toBe(false);
 const forfeit={packageId,kind:"forfeiture",credits:1,expectedBalance:5,
  requestId:randomUUID(),confirmed:true,
  reason:"Teacher approved one explicitly forfeited unused training credit",
 };
 const modelForfeit=await call("ccp_credits_adjustment_commit",forfeit);
 expect(modelForfeit.error).toBeUndefined();
 expect(modelForfeit.data.balanceAfter).toBe(4);
 const siteRetry=await page.request.post("/api/agent/v1",{
  data:{action:"credits.adjustmentCommit",...forfeit},
 });
 expect(siteRetry.status(),await siteRetry.text()).toBe(200);
 expect((await siteRetry.json()).data.replayed).toBe(true);
 const extend=await call("ccp_credits_adjustment_commit",{
  packageId,kind:"expiry_extension",credits:0,expectedBalance:4,
  newExpiresOn:"2043-12-31",requestId:randomUUID(),confirmed:true,
  reason:"Teacher explicitly extended this unused training entitlement",
 });
 expect(extend.error).toBeUndefined();
 const finalPreview=await page.request.post("/api/agent/v1",{
  data:{action:"credits.adjustmentPreview",packageId},
 });
 expect(finalPreview.status(),await finalPreview.text()).toBe(200);
 expect((await finalPreview.json()).data).toMatchObject({
  availableCredits:4,expiresOn:"2043-12-31",fullyFunded:false,
 });
 const unsupportedRefund=await call("ccp_credits_adjustment_commit",{
  packageId,kind:"refund_entitlement",credits:1,expectedBalance:4,
  sourcePaymentId:randomUUID(),refundReversalId:randomUUID(),
  requestId:randomUUID(),confirmed:true,
  reason:"A refund must have verified original funding and reversal provenance",
 });
 expect(unsupportedRefund.error?.code).toBe("CONFLICT");
 const foreign=await call("ccp_credits_adjustment_preview",{packageId:randomUUID()});
 expect(foreign.error?.code).toBe("NOT_FOUND");
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const events=await admin.from("credit_adjustment_events")
  .select("kind,credits_delta,source_payment_id,refund_reversal_id,evidence")
  .eq("package_id",packageId);
 expect(events.error).toBeNull();
 expect(events.data).toHaveLength(3);
 expect(events.data!.map(x=>x.credits_delta).sort((a,b)=>a-b)).toEqual([-1,0,2]);
 expect(events.data!.every(x=>x.source_payment_id===null&&
  x.refund_reversal_id===null&&x.evidence.cashMoved===false)).toBe(true);
});


test("FINANCE: funded cross-workplace transfer and refund entitlement require verified payer, credits and reversal",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
  name:"Funded transfer learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const places:string[]=[];
 for(const label of ["Source","Destination"]){
  const place=await call("ccp_workplaces_create",{
   name:label+" funded transfer "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(place.error).toBeUndefined();
  const workplaceId=place.data.entityId as string;
  places.push(workplaceId);
  expect((await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const {billingAccountId}=await createAssignedPayer(call,{
  studentId,workplaceId:places[0],effectiveFrom:"2040-01-01",
 });
 expect((await call("ccp_student_billing_assignments_create",{
  studentId,workplaceId:places[1],billingAccountId,
  effectiveFrom:"2040-01-01",idempotencyKey:randomUUID(),confirmed:true,
 })).error).toBeUndefined();
 const bought:{packageId:string;invoiceId:string}[]=[];
 for(const workplaceId of places){
  const product=await call("ccp_credits_package_create",{
   studentId,workplaceId,credits:3,durationMinutes:45,priceCents:6000,
   startsOn:"2042-01-01",expiresOn:"2042-12-31",
   requestId:randomUUID(),confirmed:true,
  });
  expect(product.error).toBeUndefined();
  bought.push({packageId:product.data.packageId as string,
   invoiceId:product.data.invoiceId as string});
 }
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 // Isolated, synthetic local-DB funding evidence: unlike a draft invoice,
 // actual paid state must have a matching positive legacy receipt amount.
 for(const invoice of bought){
  const receipt=await admin.from("payments").insert({
   invoice_id:invoice.invoiceId,amount_cents:6000,method:"manual",
   note:"Synthetic CI-only externally verified package receipt",
  });
  expect(receipt.error).toBeNull();
  const paid=await admin.from("invoices").update({
   status:"paid",paid_at:new Date().toISOString(),payment_method:"manual",
  }).eq("id",invoice.invoiceId);
  expect(paid.error).toBeNull();
 }
 const source=await call("ccp_credits_adjustment_preview",{packageId:bought[0].packageId});
 expect(source.error).toBeUndefined();
 expect(source.data.fullyFunded).toBe(true);
 const dest=await call("ccp_credits_adjustment_preview",{packageId:bought[1].packageId});
 expect(dest.error).toBeUndefined();
 expect(dest.data.fullyFunded).toBe(true);
 const transfer={
  packageId:bought[0].packageId,kind:"transfer",credits:1,
  expectedBalance:3,destinationPackageId:bought[1].packageId,
  requestId:randomUUID(),confirmed:true,
  reason:"Teacher approved a reviewed one-lesson entitlement transfer to the same payer",
 };
 const transferWebsite=await page.request.post("/api/agent/v1",{
  data:{action:"credits.adjustmentCommit",...transfer},
 });
 expect(transferWebsite.status(),await transferWebsite.text()).toBe(200);
 const receipt=(await transferWebsite.json()).data;
 expect(receipt).toMatchObject({balanceBefore:3,balanceAfter:2,cashMoved:false});
 const replay=await call("ccp_credits_adjustment_commit",transfer);
 expect(replay.error).toBeUndefined();
 expect(replay.data).toMatchObject({eventId:receipt.eventId,replayed:true});
 const afterSource=await call("ccp_credits_adjustment_preview",{packageId:bought[0].packageId});
 const afterDest=await call("ccp_credits_adjustment_preview",{packageId:bought[1].packageId});
 expect(afterSource.error).toBeUndefined();
 expect(afterDest.error).toBeUndefined();
 expect(afterSource.data.availableCredits).toBe(2);
 expect(afterDest.data.availableCredits).toBe(4);
 const events=await admin.from("credit_adjustment_events")
  .select("package_id,kind,credits_delta,transfer_id")
  .eq("transfer_id",transfer.requestId);
 expect(events.error).toBeNull();
 expect(events.data).toHaveLength(2);
 expect(events.data!.map(x=>x.credits_delta).sort((a,b)=>a-b)).toEqual([-1,1]);
 const overdraw=await call("ccp_credits_adjustment_commit",{
  ...transfer,credits:3,expectedBalance:2,requestId:randomUUID(),
 });
 expect(overdraw.error?.code).toBe("CONFLICT");

 // The separate native finance ledger records a REAL refund that already
 // occurred outside the app; credit adjustment never emits cash events.
 const receivedRequestId=randomUUID();
 const cash=await call("ccp_finance_payment_record",{
  billingAccountId,currency:"USD",amountCents:3000,
  receivedAt:new Date().toISOString(),method:"bank_transfer",
  externalReference:"Synthetic verified payment "+randomUUID(),
  idempotencyKey:receivedRequestId,confirmed:true,
 });
 expect(cash.error).toBeUndefined();
 const paymentId=cash.data.payment.id as string;
 const reversalRequestId=randomUUID();
 const refund=await call("ccp_finance_reversal_record",{
  kind:"payment_refund",targetId:paymentId,amountCents:2500,
  reason:"Teacher verified this external payment refund before entitlement reduction",
  idempotencyKey:reversalRequestId,confirmed:true,
 });
 expect(refund.error).toBeUndefined();
 const refundRow=await admin.from("financial_reversals")
  .select("id,amount_cents,kind").eq("request_id",reversalRequestId).single();
 expect(refundRow.error).toBeNull();
 expect(refundRow.data).toMatchObject({kind:"payment_refund",amount_cents:2500});
 const refundTerms={
  packageId:bought[0].packageId,kind:"refund_entitlement",credits:1,
  expectedBalance:2,sourcePaymentId:paymentId,
  refundReversalId:refundRow.data!.id as string,
  requestId:randomUUID(),confirmed:true,
  reason:"Reduce one unused prepaid credit after the independent verified refund",
 };
 const refunded=await call("ccp_credits_adjustment_commit",refundTerms);
 expect(refunded.error).toBeUndefined();
 expect(refunded.data).toMatchObject({
  balanceBefore:2,balanceAfter:1,cashMoved:false,replayed:false,
 });
 const receiptReplay=await page.request.post("/api/agent/v1",{
  data:{action:"credits.adjustmentCommit",...refundTerms},
 });
 expect(receiptReplay.status(),await receiptReplay.text()).toBe(200);
 expect((await receiptReplay.json()).data.replayed).toBe(true);
 const twice=await call("ccp_credits_adjustment_commit",{
  ...refundTerms,requestId:randomUUID(),expectedBalance:1,
 });
 expect(twice.error?.code).toBe("CONFLICT");
 const final=await call("ccp_credits_adjustment_preview",{packageId:bought[0].packageId});
 expect(final.error).toBeUndefined();
 expect(final.data.availableCredits).toBe(1);
 const allEvents=await admin.from("credit_adjustment_events")
  .select("kind,credits_delta,refund_reversal_id")
  .eq("package_id",bought[0].packageId);
 expect(allEvents.error).toBeNull();
 expect(allEvents.data).toHaveLength(2);
 expect(allEvents.data!.find(x=>x.kind==="refund_entitlement")?.refund_reversal_id)
  .toBe(refundRow.data!.id);
});
