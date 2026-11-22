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

/** PAY-05 covers entitlement from recorded state, not provider event ingestion. */
test("PAY-05 grants only explicit paid-through or grace time; failed, refunded and disputed states never infer access",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="subscription-boundary-"+randomUUID()+"@example.com",password="SyntheticSubscriptionBoundary-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id,email,display_name:"Synthetic subscription boundaries",
  })).error).toBeNull();
  const baseline=await configureSyntheticStudentCapacity(admin,id,1);
  const paidPlan=await admin.from("plan_versions").select("id").eq("code","pro").eq("version",1).single();
  expect(paidPlan.error).toBeNull();
  const scope="scope_"+randomUUID();
  const customer=await admin.from("platform_billing_customers").insert({
   teacher_id:id,provider:"synthetic",merchant_scope:scope,external_customer_id:"test_"+randomUUID(),
  }).select("id").single();
  expect(customer.error).toBeNull();
  const offer=await admin.from("platform_subscription_offers").insert({
   plan_version_id:paidPlan.data!.id,provider:"synthetic",merchant_scope:scope,
   external_price_id:"test_"+randomUUID(),currency:"USD",billing_interval:"month",
   effective_from:"2026-01-01T00:00:00Z",
  }).select("id").single();
  expect(offer.error).toBeNull();
  const end="2070-06-15T12:00:00.000Z",before="2070-06-15T11:59:59.999Z";
  const after="2070-06-15T12:00:00.001Z",later="2070-07-15T12:00:00.000Z";
  const earlier="2070-05-15T12:00:00.000Z";
  const initial=await admin.from("platform_subscriptions").insert({
   teacher_id:id,customer_id:customer.data!.id,offer_id:offer.data!.id,
   provider:"synthetic",merchant_scope:scope,external_subscription_id:"test_"+randomUUID(),
   state:"past_due",latest_event_time:"2026-01-01T00:00:00.000Z",
   paid_through:later,grace_until:later,current_period_end:later,
  }).select("id").single();
  expect(initial.error).toBeNull();
  const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  let seq=0;
  const update=async(state:string,times:Record<string,string|null>)=>{
   const latest_event_time=new Date(Date.UTC(2026,0,1,0,0,++seq)).toISOString();
   const result=await admin.from("platform_subscriptions").update({
    state,paid_through:null,grace_until:null,current_period_end:null,cancel_at:null,
    ...times,latest_event_time,
   }).eq("id",initial.data!.id).select("revision").single();
   expect(result.error,state).toBeNull();
   expect(result.data?.revision,state).toBe(seq);
  };
  const evaluate=async(at:string,paid:boolean)=>{
   const result=await auth.rpc("ccp_effective_capability",{
    p_teacher:id,p_capability_key:"students.active",p_at:at,
   });
   expect(result.error).toBeNull();
   expect(result.data).toMatchObject(paid
    ? {planVersionId:paidPlan.data!.id,planCode:"pro",limit:null,unlimited:true}
    : {planVersionId:baseline.planId,limit:1,unlimited:false});
   const reports=await auth.rpc("ccp_effective_capability",{
    p_teacher:id,p_capability_key:"reports.publish",p_at:at,
   });
   expect(reports.error).toBeNull();
   expect(reports.data?.enabled).toBe(paid);
  };
  // A failed collection is not a grace grant even with future metadata.
  await evaluate(before,false);
  await update("grace",{grace_until:end,paid_through:later,current_period_end:later});
  await evaluate(before,true);
  await evaluate(end,false);
  await evaluate(after,false);
  await update("grace",{paid_through:later,current_period_end:later});
  await evaluate(before,false);
  await update("cancel_at_period_end",{
   paid_through:end,current_period_end:later,grace_until:later,cancel_at:earlier,
  });
  await evaluate(before,true);
  await evaluate(end,false);
  await evaluate(after,false);
  // The real-time writer also reads current entitlement, independently of
  // caller-supplied p_at on the read-only evaluator.
  const names=["Retained pupil "+randomUUID(),"Retained pupil "+randomUUID()];
  for(const name of names){
   const created=await auth.from("students").insert({teacher_id:id,name}).select("id").single();
   expect(created.error).toBeNull();
  }
  await update("refunded",{paid_through:later,grace_until:later,current_period_end:later});
  await evaluate(before,false);
  const denied=await auth.from("students").insert({teacher_id:id,name:"Blocked after refund "+randomUUID()});
  expect(denied.error?.code).toBe("23514");
  expect(denied.error?.message).toBe("CAPACITY_EXCEEDED");
  await update("disputed",{paid_through:later,grace_until:later,current_period_end:later});
  await evaluate(before,false);
  await update("canceled",{paid_through:later,grace_until:later,current_period_end:later});
  await evaluate(before,false);
  const rows=await auth.from("students").select("name").eq("teacher_id",id).is("archived_at",null);
  expect(rows.error).toBeNull();
  expect(rows.data?.map(row=>row.name).sort()).toEqual(names.sort());
  const summary=await auth.rpc("ccp_entitlement_summary");
  expect(summary.error).toBeNull();
  expect(summary.data).toMatchObject({activeStudentCount:2,studentCapacity:{limit:1,unlimited:false}});
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});

test("ENT-09 active paid Pro is independent of an individual grant and its expiry",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const email="paid-plus-grant-"+randomUUID()+"@example.com",password="SyntheticPaidPlusGrant-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const id=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({id,email,display_name:"Synthetic paid with grant"})).error).toBeNull();
  expect((await auth.auth.signInWithPassword({email,password})).error).toBeNull();
  const base=await configureSyntheticStudentCapacity(admin,id,1);
  const pro=await admin.from("plan_versions").select("id").eq("code","pro").eq("version",1).single();
  expect(pro.error).toBeNull();
  const merchant_scope="paid_plus_grant_"+randomUUID();
  const merchant={provider:"synthetic",merchant_scope};
  const customer=await admin.from("platform_billing_customers").insert({
   ...merchant,teacher_id:id,external_customer_id:"customer",
  }).select("id").single();
  expect(customer.error).toBeNull();
  const offer=await admin.from("platform_subscription_offers").insert({
   ...merchant,plan_version_id:pro.data!.id,external_price_id:"offer",currency:"USD",
   billing_interval:"month",effective_from:"2026-01-01T00:00:00.000Z",
  }).select("id").single();
  expect(offer.error).toBeNull();
  const grantEnds="2070-06-10T12:00:00.000Z",paidEnds="2070-06-15T12:00:00.000Z";
  const grant=await admin.from("teacher_entitlement_grants").insert({
   teacher_id:id,kind:"capability_boost",capability_key:"students.active",
   capability_kind:"integer_limit",integer_value:3,unlimited:false,
   valid_from:"2026-01-01T00:00:00.000Z",expires_at:grantEnds,
   reason:"Synthetic independent student allowance",request_id:randomUUID(),
  }).select("id").single();
  expect(grant.error).toBeNull();
  const evaluate=async(key:string,at:string)=>{
   const result=await auth.rpc("ccp_effective_capability",{p_teacher:id,p_capability_key:key,p_at:at});
   expect(result.error).toBeNull();
   return result.data;
  };
  // The individual grant is demonstrably active, but grants no Pro functions.
  const overlap="2070-06-10T11:59:59.999Z";
  expect(await evaluate("students.active",overlap)).toMatchObject({
   planVersionId:base.planId,limit:3,unlimited:false,
  });
  expect(await evaluate("reports.publish",overlap)).toMatchObject({enabled:false});
  const sub=await admin.from("platform_subscriptions").insert({
   ...merchant,teacher_id:id,customer_id:customer.data!.id,offer_id:offer.data!.id,
   external_subscription_id:"sub",state:"active",paid_through:paidEnds,
   current_period_end:paidEnds,latest_event_time:"2026-01-01T00:00:00.000Z",
  }).select("id,state,paid_through,current_period_end,revision").single();
  expect(sub.error).toBeNull();
  // Both overlap and the exact exclusive grant expiry keep separately paid Pro.
  for(const at of [overlap,grantEnds,"2070-06-15T11:59:59.999Z"]){
   expect(await evaluate("students.active",at)).toMatchObject({
    planVersionId:pro.data!.id,planCode:"pro",limit:null,unlimited:true,
   });
   expect(await evaluate("reports.publish",at)).toMatchObject({enabled:true});
  }
  expect(await evaluate("students.active",paidEnds)).toMatchObject({planVersionId:base.planId,limit:1});
  expect(await evaluate("reports.publish",paidEnds)).toMatchObject({enabled:false});
  const readback=await admin.from("platform_subscriptions").select("id,state,paid_through,current_period_end,revision")
    .eq("id",sub.data!.id).single();
  expect(readback.error).toBeNull();
  expect(readback.data).toEqual(sub.data);
 }finally{
  expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
