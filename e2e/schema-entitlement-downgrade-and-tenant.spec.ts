import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

/**
 * ADR-0019 ENT-09/10, SCH-04/05 and PAY-06: fresh-install synthetic SQL
 * acceptance probes. This does not exercise a real payment adapter/cutover.
 */
function adminClient(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
}

async function createSyntheticTeacher(admin:ReturnType<typeof adminClient>){
 const email="schema-transition-"+randomUUID()+"@example.com";
 const password="SyntheticTransition123!";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(created.error).toBeNull();
 const id=created.data.user!.id;
 const inserted=await admin.from("teachers").insert({
  id,email,display_name:"Synthetic entitlement transition",
 });
 expect(inserted.error).toBeNull();
 return {id,email,password};
}

async function authenticatedTeacher(identity:{email:string;password:string}){
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
  });
 const login=await client.auth.signInWithPassword(identity);
 expect(login.error).toBeNull();
 return client;
}

test("independent capacity boost survives paid expiry without deleting over-limit history",async()=>{
 const admin=adminClient();
 const teacher=await createSyntheticTeacher(admin);
 try{
  const baseline=await configureSyntheticStudentCapacity(admin,teacher.id,1);
  const pro=await admin.from("plan_versions").select("id")
   .eq("code","pro").eq("version",1).single();
  expect(pro.error).toBeNull();
  const scope="transition_"+randomUUID();
  const customer=await admin.from("platform_billing_customers").insert({
   teacher_id:teacher.id,provider:"synthetic",merchant_scope:scope,
   external_customer_id:"customer_"+randomUUID(),
  }).select("id").single();
  expect(customer.error).toBeNull();
  const offer=await admin.from("platform_subscription_offers").insert({
   plan_version_id:pro.data!.id,provider:"synthetic",merchant_scope:scope,
   external_price_id:"price_"+randomUUID(),currency:"USD",
   billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
  }).select("id").single();
  expect(offer.error).toBeNull();
  const future=new Date(Date.now()+86400000).toISOString();
  const subscription=await admin.from("platform_subscriptions").insert({
   teacher_id:teacher.id,customer_id:customer.data!.id,
   offer_id:offer.data!.id,provider:"synthetic",merchant_scope:scope,
   external_subscription_id:"subscription_"+randomUUID(),state:"active",
   paid_through:future,current_period_end:future,
   latest_event_time:new Date(Date.now()-60000).toISOString(),
  }).select("id").single();
  expect(subscription.error).toBeNull();

  const auth=await authenticatedTeacher(teacher);
  const capacity=async()=>{
   const summary=await auth.rpc("ccp_entitlement_summary");
   expect(summary.error).toBeNull();
   return summary.data;
  };
  expect((await capacity()).studentCapacity.planCode).toBe("pro");
  const ids:string[]=[];
  for(let i=0;i<3;i++){
   const inserted=await auth.from("students").insert({
    teacher_id:teacher.id,name:"Preserved learner "+i+" "+randomUUID(),
   }).select("id").single();
   expect(inserted.error).toBeNull();
   ids.push(inserted.data!.id);
  }
  const boost=await admin.from("teacher_entitlement_grants").insert({
   teacher_id:teacher.id,kind:"capability_boost",
   capability_key:"students.active",capability_kind:"integer_limit",
   integer_value:2,unlimited:false,
   reason:"Independently approved synthetic roster capacity",
   request_id:randomUUID(),
  });
  expect(boost.error).toBeNull();
  // Expiring a real verified subscription never deletes the grant or rows.
  const expired=await admin.from("platform_subscriptions").update({
   state:"expired",paid_through:"2020-01-01T00:00:00Z",
   latest_event_time:new Date(Date.now()+1000).toISOString(),
  }).eq("id",subscription.data!.id);
  expect(expired.error).toBeNull();
  const after=await capacity();
  expect(after.studentCapacity.planVersionId).toBe(baseline.planId);
  expect(after.studentCapacity.limit).toBe(2);
  expect(after.activeStudentCount).toBe(3);
  const preserved=await auth.from("students").select("id")
   .eq("teacher_id",teacher.id);
  expect(preserved.error).toBeNull();
  expect(preserved.data?.map(s=>s.id).sort()).toEqual([...ids].sort());
  const correction=await auth.from("students").update({
   name:"Corrected teaching record",
  }).eq("id",ids[0]);
  expect(correction.error).toBeNull();
  const noGrowth=await auth.from("students").insert({
   teacher_id:teacher.id,name:"Over-limit learner "+randomUUID(),
  });
  expect(noGrowth.error?.message).toContain("CAPACITY_EXCEEDED");

  // A teacher can voluntarily archive two students while retaining IDs.
  for(const studentId of ids.slice(1)){
   const preview=await auth.rpc("ccp_student_lifecycle_preview",{
    p_student_id:studentId,
   });
   expect(preview.error).toBeNull();
   const archive=await auth.rpc("ccp_student_lifecycle_commit",{
    p_student_id:studentId,p_mode:"archive",
    p_expected_updated_at:preview.data.expectedUpdatedAt,
    p_selected_workplaces:[],p_request_id:randomUUID(),
    p_reason:"Teacher explicitly reviewed historical learner archive",
    p_confirmed:true,
   });
   expect(archive.error).toBeNull();
  }
  const replacement=await auth.from("students").insert({
   teacher_id:teacher.id,name:"Under-limit replacement "+randomUUID(),
  });
  expect(replacement.error).toBeNull();
  const state=await capacity();
  expect(state.activeStudentCount).toBe(2);
  expect(state.studentCapacity.limit).toBe(2);
  const history=await auth.from("students").select("id,archived_at")
   .in("id",ids.slice(1));
  expect(history.error).toBeNull();
  expect(history.data).toHaveLength(2);
  expect(history.data?.every(s=>s.archived_at!==null)).toBe(true);
 }finally{
  expect((await admin.auth.admin.deleteUser(teacher.id)).error).toBeNull();
 }
});

test("platform subscription FKs and webhook event IDs are tenant and merchant scoped",async()=>{
 const admin=adminClient();
 const first=await createSyntheticTeacher(admin);
 const second=await createSyntheticTeacher(admin);
 const scopeA="merchant_a_"+randomUUID();
 const scopeB="merchant_b_"+randomUUID();
 try{
  const pro=await admin.from("plan_versions").select("id")
   .eq("code","pro").eq("version",1).single();
  expect(pro.error).toBeNull();
  const sharedExternalId="external_"+randomUUID();
  const customerA=await admin.from("platform_billing_customers").insert({
   teacher_id:first.id,provider:"synthetic",merchant_scope:scopeA,
   external_customer_id:sharedExternalId,
  }).select("id").single();
  const customerB=await admin.from("platform_billing_customers").insert({
   teacher_id:second.id,provider:"synthetic",merchant_scope:scopeB,
   external_customer_id:sharedExternalId,
  }).select("id").single();
  expect(customerA.error).toBeNull();
  expect(customerB.error).toBeNull();
  const offerA=await admin.from("platform_subscription_offers").insert({
   plan_version_id:pro.data!.id,provider:"synthetic",merchant_scope:scopeA,
   external_price_id:"price_"+randomUUID(),currency:"USD",
   billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
  }).select("id").single();
  const offerB=await admin.from("platform_subscription_offers").insert({
   plan_version_id:pro.data!.id,provider:"synthetic",merchant_scope:scopeB,
   external_price_id:"price_"+randomUUID(),currency:"USD",
   billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
  }).select("id").single();
  expect(offerA.error).toBeNull();
  expect(offerB.error).toBeNull();
  const subscription={
   teacher_id:first.id,customer_id:customerA.data!.id,
   offer_id:offerA.data!.id,provider:"synthetic",merchant_scope:scopeA,
   external_subscription_id:"subscription_"+randomUUID(),
   state:"trialing",current_period_end:"2020-01-01T00:00:00Z",
  };
  const foreignCustomer=await admin.from("platform_subscriptions").insert({
   ...subscription,customer_id:customerB.data!.id,
   external_subscription_id:"foreign_"+randomUUID(),
  });
  expect(foreignCustomer.error?.code).toBe("23503");
  const foreignOffer=await admin.from("platform_subscriptions").insert({
   ...subscription,offer_id:offerB.data!.id,
   external_subscription_id:"wrong_scope_"+randomUUID(),
  });
  expect(foreignOffer.error?.code).toBe("23503");
  const valid=await admin.from("platform_subscriptions")
   .insert(subscription).select("id").single();
  expect(valid.error).toBeNull();
  const other=await authenticatedTeacher(second);
  const invisible=await other.from("platform_subscriptions")
   .select("id").eq("id",valid.data!.id);
  expect(invisible.error).toBeNull();
  expect(invisible.data).toEqual([]);
  const mutate=await other.from("platform_subscriptions")
   .update({state:"active"}).eq("id",valid.data!.id);
  expect(mutate.error).not.toBeNull();

  // An external webhook ID is unique only inside its verified merchant scope.
  const externalEventId="event_"+randomUUID();
  const eventBase={
   provider:"synthetic",external_event_id:externalEventId,
   event_type:"subscription.updated",
   signature_verified_at:new Date().toISOString(),
   payload_sha256:"a".repeat(64),
  };
  const one=await admin.from("platform_billing_events").insert({
   ...eventBase,merchant_scope:scopeA,teacher_id:first.id,
  });
  const two=await admin.from("platform_billing_events").insert({
   ...eventBase,merchant_scope:scopeB,teacher_id:second.id,
  });
  expect(one.error).toBeNull();
  expect(two.error).toBeNull();
  const replay=await admin.from("platform_billing_events").insert({
   ...eventBase,merchant_scope:scopeA,teacher_id:first.id,
  });
  expect(replay.error?.code).toBe("23505");
 }finally{
  await admin.from("platform_billing_events").delete()
   .in("merchant_scope",[scopeA,scopeB]);
  expect((await admin.auth.admin.deleteUser(first.id)).error).toBeNull();
  expect((await admin.auth.admin.deleteUser(second.id)).error).toBeNull();
 }
});
