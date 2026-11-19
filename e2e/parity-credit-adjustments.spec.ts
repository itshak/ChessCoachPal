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
