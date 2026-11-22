import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-native-finance-receipt and correction stay private to the owning teacher",async({
 page,request,browser,baseURL,
})=>{
 const origin=new URL(baseURL!).origin;
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const otherContext=await browser.newContext({baseURL});
 let neighboringTeacherId:string|undefined;
 try{
  const owner=await delegatedTool(page,request);
  const email="finance-boundary-"+randomUUID()+"@example.com";
  const password="Synthetic-Finance-Boundary123!";
  const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(identity.error).toBeNull();
  neighboringTeacherId=identity.data.user!.id;
  expect((await admin.from("teachers").insert({
   id:neighboringTeacherId,email,display_name:"Synthetic neighboring finance teacher",
   onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  const neighborPage=await otherContext.newPage();
  const neighbor=await delegatedTool(neighborPage,request,"coach:read coach:write",{email,password});
  const account=await owner("ccp_billing_accounts_create",{
   displayName:"Synthetic private payer "+randomUUID(),accountKind:"person",
   idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(account.error).toBeUndefined();
  const billingAccountId=account.data.id as string;
  const receipt={
   billingAccountId,currency:"ILS",amountCents:6000,receivedAt:new Date().toISOString(),
   method:"bank_transfer",externalReference:"Synthetic prior payment "+randomUUID(),
   idempotencyKey:randomUUID(),confirmed:true,
  };
  const recorded=await page.request.post("/api/finance-ledger/payments",{headers:{origin},data:receipt});
  expect(recorded.status(),await recorded.text()).toBe(201);
  const {payment}=await recorded.json();
  const paymentId=payment.id as string;
  const replay=await owner("ccp_finance_payment_record",receipt);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toMatchObject({replayed:true,payment:{id:paymentId,amount_cents:6000}});
  const rejectedReceipt={...receipt,idempotencyKey:randomUUID()};
  const websiteReceipt=await neighborPage.request.post("/api/finance-ledger/payments",{
   headers:{origin},data:rejectedReceipt,
  });
  expect(websiteReceipt.status()).toBe(403);
  const modelReceipt=await neighbor("ccp_finance_payment_record",rejectedReceipt);
  expect(modelReceipt).toEqual({error:{code:"BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED",
   message:"billing account not active or owned"}});
  expect(await websiteReceipt.json()).toEqual({
   code:modelReceipt.error!.code,error:modelReceipt.error!.message,
  });

  const rejectedRefund={
   kind:"payment_refund",targetId:paymentId,amountCents:1000,
   reason:"Synthetic already performed refund evidence",idempotencyKey:randomUUID(),confirmed:true,
  };
  const websiteRefund=await neighborPage.request.post("/api/finance-ledger/reversals",{
   headers:{origin},data:rejectedRefund,
  });
  expect(websiteRefund.status()).toBe(403);
  const modelRefund=await neighbor("ccp_finance_reversal_record",rejectedRefund);
  expect(modelRefund).toEqual({error:{code:"PAYMENT_NOT_OWNED",message:"payment not owned"}});
  expect(await websiteRefund.json()).toEqual({
   code:modelRefund.error!.code,error:modelRefund.error!.message,
  });

  const ownedRefund={...rejectedRefund,idempotencyKey:randomUUID()};
  const corrected=await owner("ccp_finance_reversal_record",ownedRefund);
  expect(corrected.error).toBeUndefined();
  const reversalId=corrected.data.reversal.id as string;
  const replayRefund=await page.request.post("/api/finance-ledger/reversals",{
   headers:{origin},data:ownedRefund,
  });
  expect(replayRefund.status(),await replayRefund.text()).toBe(201);
  expect(await replayRefund.json()).toMatchObject({replayed:true,reversal:{id:reversalId}});
  for(const [currentPage,call,canRead] of [[page,owner,true],[neighborPage,neighbor,false]] as const){
   const ledger=await currentPage.request.get("/api/finance-ledger");
   expect(ledger.status(),await ledger.text()).toBe(200);
   const model=await call("ccp_finance_ledger_list",{});
   expect(model.error).toBeUndefined();
   expect(model.data).toEqual(await ledger.json());
   expect(model.data.receivedPayments.some((row:{id:string})=>row.id===paymentId)).toBe(canRead);
   expect(model.data.reversals.some((row:{id:string})=>row.id===reversalId)).toBe(canRead);
  }

  const actual=await admin.from("received_payments").select("id,amount_cents,external_reference")
   .eq("billing_account_id",billingAccountId);
  const corrections=await admin.from("financial_reversals").select("id,amount_cents")
   .eq("received_payment_id",paymentId);
  const invoices=await admin.from("invoices").select("id").eq("billing_account_id",billingAccountId);
  for(const query of [actual,corrections,invoices])expect(query.error).toBeNull();
  expect(actual.data).toEqual([{id:paymentId,amount_cents:6000,external_reference:receipt.externalReference}]);
  expect(corrections.data).toEqual([{id:reversalId,amount_cents:1000}]);
  expect(invoices.data).toEqual([]);
  // The owner's immutable synthetic ledger remains for the isolated DB teardown;
  // the signed-in neighbor did not write a receipt or a reversal and can be removed.
 }finally{
  await otherContext.close();
  if(neighboringTeacherId)expect((await admin.auth.admin.deleteUser(neighboringTeacherId)).error).toBeNull();
 }
});
