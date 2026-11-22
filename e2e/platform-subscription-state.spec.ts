import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

/** Subscription schema proof: time-limited verified platform state, never teacher finance. */
test("trial and paid-through access expire; stale provider updates cannot restore access",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="subscription-state-"+randomUUID()+"@example.com";
 const password="SyntheticSubscription-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 expect((await admin.from("teachers").insert({
  id,email,display_name:"Synthetic subscription state",
 })).error).toBeNull();
 await configureSyntheticStudentCapacity(admin,id,1);
 const pro=await admin.from("plan_versions").select("id")
  .eq("code","pro").eq("version",1).single();
 expect(pro.error).toBeNull();
 const scope="scope_"+randomUUID();
 const customer=await admin.from("platform_billing_customers").insert({
  teacher_id:id,provider:"synthetic",merchant_scope:scope,
  external_customer_id:"customer_"+randomUUID(),
 }).select("id").single();
 expect(customer.error).toBeNull();
 const offer=await admin.from("platform_subscription_offers").insert({
  plan_version_id:pro.data!.id,provider:"synthetic",merchant_scope:scope,
  external_price_id:"price_"+randomUUID(),currency:"USD",
  billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
 }).select("id").single();
 expect(offer.error).toBeNull();
 const subscription=await admin.from("platform_subscriptions").insert({
  teacher_id:id,customer_id:customer.data!.id,offer_id:offer.data!.id,
  provider:"synthetic",merchant_scope:scope,
  external_subscription_id:"sub_"+randomUUID(),state:"trialing",
  current_period_end:"2020-01-01T00:00:00Z",
  latest_event_time:"2020-01-01T00:00:00Z",
 }).select("id").single();
 expect(subscription.error).toBeNull();
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
 const capacity=async()=>{
  const result=await auth.rpc("ccp_entitlement_summary");
  expect(result.error).toBeNull();
  return result.data.studentCapacity;
 };
 expect((await capacity()).limit).toBe(1);
 const future=new Date(Date.now()+86400000).toISOString();
 const newer=new Date(Date.now()-60000).toISOString();
 const active=await admin.from("platform_subscriptions").update({
  state:"active",paid_through:future,current_period_end:future,
  latest_event_time:newer,
 }).eq("id",subscription.data!.id);
 expect(active.error).toBeNull();
 expect((await capacity()).planCode).toBe("pro");
 const stale=await admin.from("platform_subscriptions").update({
  state:"canceled",latest_event_time:"2020-01-01T00:00:00Z",
 }).eq("id",subscription.data!.id);
 expect(stale.error?.message).toContain("STALE_SUBSCRIPTION_EVENT");
 expect((await capacity()).planCode).toBe("pro");
 // A stale/expired old subscription must not demote a separately valid
 // replacement subscription for the same teacher and commercial offer.
 const replacement=await admin.from("platform_subscriptions").insert({
  teacher_id:id,customer_id:customer.data!.id,offer_id:offer.data!.id,
  provider:"synthetic",merchant_scope:scope,
  external_subscription_id:"sub_replacement_"+randomUUID(),state:"active",
  current_period_end:future,paid_through:future,
  latest_event_time:new Date().toISOString(),
 }).select("id").single();
 expect(replacement.error).toBeNull();
 const expired=await admin.from("platform_subscriptions").update({
  state:"expired",paid_through:"2020-01-01T00:00:00Z",
  latest_event_time:new Date().toISOString(),
 }).eq("id",subscription.data!.id);
 expect(expired.error).toBeNull();
 expect((await capacity()).planCode).toBe("pro");
 const replacementExpired=await admin.from("platform_subscriptions").update({
  state:"expired",paid_through:"2020-01-01T00:00:00Z",
  latest_event_time:new Date(Date.now()+10000).toISOString(),
 }).eq("id",replacement.data!.id);
 expect(replacementExpired.error).toBeNull();
 expect((await capacity()).limit).toBe(1);
 const denied=await auth.from("platform_subscriptions").update({
  state:"active",paid_through:future,
 }).eq("id",subscription.data!.id);
 expect(denied.error).not.toBeNull();
 expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
});
