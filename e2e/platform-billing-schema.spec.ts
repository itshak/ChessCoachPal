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
