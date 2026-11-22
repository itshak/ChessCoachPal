import {randomUUID,createHash} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

/**
 * Schema-only provider boundary: no checkout redirect or client-generated event
 * can confer entitlements. A verified provider adapter remains downstream.
 */
test("provider event identities are replay-safe and never client-writable",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="billing-schema-"+randomUUID()+"@example.com";
 const password="SyntheticBilling-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Billing schema synthetic teacher",
 })).error).toBeNull();
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const event={
  provider:"synthetic",merchant_scope:"test_"+randomUUID(),
  external_event_id:"evt_"+randomUUID(),
  external_subscription_id:"sub_"+randomUUID(),teacher_id:id,
  event_type:"subscription.updated",signature_verified_at:new Date().toISOString(),
  payload_sha256:createHash("sha256").update(randomUUID()).digest("hex"),
 };
 const unauthorized=await auth.from("platform_billing_events").insert(event);
 expect(unauthorized.error).not.toBeNull();
 const first=await admin.from("platform_billing_events").insert(event)
  .select("id").single();
 expect(first.error).toBeNull();
 const replay=await admin.from("platform_billing_events").insert(event);
 expect(replay.error?.code).toBe("23505");
 const spoof=await admin.from("platform_billing_events")
  .update({external_event_id:"forged_"+randomUUID()}).eq("id",first.data!.id);
 expect(spoof.error?.message).toContain("IMMUTABLE");
 const privateRead=await auth.from("platform_billing_events")
  .select("id").eq("id",first.data!.id);
 expect(privateRead.error).not.toBeNull();
 const summary=await auth.rpc("ccp_entitlement_summary");
 expect(summary.error).toBeNull();
 expect(summary.data.studentCapacity.planCode).toBe("free");
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});

test("PAY-06 provider and merchant namespaces coexist without changing teacher finance",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const nonce=randomUUID();
 // Use an isolated teacher so this Pro state cannot affect any seeded
 // teacher's independent entitlement or ledger tests.
 const email="merchant-scope-"+nonce+"@example.com",password="SyntheticMerchantScope-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Synthetic platform-merchant boundary",
 })).error).toBeNull();
 const signed=await auth.auth.signInWithPassword({email,password});
 expect(signed.error).toBeNull();
 const account=await admin.from("billing_accounts").insert({
  teacher_id:id,display_name:"Synthetic isolated platform-provider teacher ledger "+nonce,
 }).select("id").single();
 expect(account.error).toBeNull();
 const billingAccountId=account.data!.id;
 // One teacher-owned synthetic cashier receipt exists before any platform state.
 const receipt=await auth.rpc("ccp_finance_record_payment",{
  p_billing_account_id:billingAccountId,p_currency:"USD",p_amount_cents:4200,
  p_received_at:new Date().toISOString(),p_method:"cash",
  p_external_reference:"Synthetic offline teaching receipt "+nonce,p_request_id:randomUUID(),
 });
 expect(receipt.error).toBeNull();
 const ledger=async()=>{
  const payments=await auth.from("received_payments").select("id,amount_cents,currency,external_reference")
   .eq("billing_account_id",billingAccountId);
  const invoices=await auth.from("invoices").select("id,status,subtotal_cents")
   .eq("billing_account_id",billingAccountId);
  expect(payments.error).toBeNull();
  expect(invoices.error).toBeNull();
  return {payments:payments.data,invoices:invoices.data};
 };
 const before=await ledger();
 expect(before).toMatchObject({payments:[{id:receipt.data.payment.id,amount_cents:4200}],invoices:[]});
 const plan=await admin.from("plan_versions").select("id").eq("code","pro").eq("version",1).single();
 expect(plan.error).toBeNull();
 const scopeA="test_shop_a_"+nonce,scopeB="test_shop_b_"+nonce;
 const namespaces=[
  {provider:"synthetic_first",merchant_scope:scopeA},
  {provider:"synthetic_second",merchant_scope:scopeA},
  {provider:"synthetic_first",merchant_scope:scopeB},
 ];
 const rows=[];
 for(const ns of namespaces){
  const customerInput={...ns,teacher_id:id,external_customer_id:"customer"};
  const customer=await admin.from("platform_billing_customers").insert(customerInput).select("id").single();
  expect(customer.error).toBeNull();
  const offerInput={...ns,plan_version_id:plan.data!.id,external_price_id:"offer",currency:"USD",
   billing_interval:"month",effective_from:"2026-01-01T00:00:00Z"};
  const offer=await admin.from("platform_subscription_offers").insert(offerInput).select("id").single();
  expect(offer.error).toBeNull();
  const subscriptionInput={...ns,teacher_id:id,customer_id:customer.data!.id,
   offer_id:offer.data!.id,external_subscription_id:"subscription",state:"active",
   current_period_end:"2070-06-15T12:00:00Z",paid_through:"2070-06-15T12:00:00Z",
   latest_event_time:"2026-01-01T00:00:00Z"};
  const sub=await admin.from("platform_subscriptions").insert(subscriptionInput).select("id").single();
  expect(sub.error).toBeNull();
  const eventInput={...ns,teacher_id:id,external_event_id:"event",external_subscription_id:"subscription",
   event_type:"subscription.updated",signature_verified_at:"2026-01-01T00:00:00Z",payload_sha256:"a".repeat(64)};
  const event=await admin.from("platform_billing_events").insert(eventInput).select("id").single();
  expect(event.error).toBeNull();
  rows.push({customerInput,offerInput,subscriptionInput,eventInput,subId:sub.data!.id,eventId:event.data!.id});
 }
 expect(new Set(rows.map(row=>row.subId)).size).toBe(3);
 expect(new Set(rows.map(row=>row.eventId)).size).toBe(3);
 const [first,second,third]=rows;
 for(const duplicate of await Promise.all([
  admin.from("platform_billing_customers").insert(first.customerInput),
  admin.from("platform_subscription_offers").insert(first.offerInput),
  admin.from("platform_subscriptions").insert(first.subscriptionInput),
  admin.from("platform_billing_events").insert(first.eventInput),
 ]))expect(duplicate.error?.code).toBe("23505");
 const wrongProvider=await admin.from("platform_subscriptions").insert({
  ...first.subscriptionInput,external_subscription_id:"wrong_customer_namespace",
  customer_id:second.subscriptionInput.customer_id,
 });
 const wrongMerchant=await admin.from("platform_subscriptions").insert({
  ...first.subscriptionInput,external_subscription_id:"wrong_offer_namespace",
  offer_id:third.subscriptionInput.offer_id,
 });
 expect(wrongProvider.error?.code).toBe("23503");
 expect(wrongMerchant.error?.code).toBe("23503");
 const cancelled=await admin.from("platform_subscriptions").update({
  state:"canceled",latest_event_time:"2026-01-02T00:00:00Z",
 }).eq("id",first.subId);
 expect(cancelled.error).toBeNull();
 const stored=await admin.from("platform_subscriptions").select("id,state").in("id",rows.map(row=>row.subId));
 expect(stored.error).toBeNull();
 expect(stored.data).toEqual(expect.arrayContaining([
  {id:first.subId,state:"canceled"},{id:second.subId,state:"active"},{id:third.subId,state:"active"},
 ]));
 const pro=await auth.rpc("ccp_effective_capability",{
  p_teacher:id,p_capability_key:"reports.publish",p_at:"2070-06-15T11:59:59.999Z",
 });
 expect(pro.error).toBeNull();
 expect(pro.data).toMatchObject({planVersionId:plan.data!.id,planCode:"pro",enabled:true});
 expect(await ledger()).toEqual(before);
 // Immutable simulated finance records are removed by disposable DB teardown.
 // Never send real provider requests or initiate a payment in this test.
});
