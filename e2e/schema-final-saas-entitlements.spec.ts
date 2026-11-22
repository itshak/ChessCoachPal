import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** ADR-0019 P0 schema-only security proof: synthetic tenants only.
 * No platform plan activation, real payment or live migration is performed.
 */
test("P0 normalized grants are owner-readable and provider events are service-only",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
 const users:{id:string;email:string;password:string}[]=[];
 let planId:string|null=null;
 const merchantScope="synthetic-"+randomUUID();
 try {
  for(let i=0;i<2;i++){
   const email="schema-ent-"+randomUUID()+"@example.com";
   const password="SyntheticSchemaCheck123!";
   const {data,error}=await admin.auth.admin.createUser({
    email,password,email_confirm:true,
   });
   expect(error).toBeNull();
   const id=data.user!.id;
   users.push({id,email,password});
   const inserted=await admin.from("teachers").insert({
    id,email,display_name:"Synthetic entitlement teacher "+i,
   });
   expect(inserted.error).toBeNull();
  }
  const code="test_"+randomUUID().replaceAll("-","");
  const plan=await admin.from("plan_versions").insert({
   code,version:1,lifecycle:"draft",
  }).select("id").single();
  expect(plan.error).toBeNull();
  planId=plan.data!.id as string;
  for(const user of users){
   const state=await admin.from("teacher_entitlement_state")
    .update({baseline_plan_version_id:planId})
    .eq("teacher_id",user.id);
   expect(state.error).toBeNull();
  }
  const grant=await admin.from("teacher_entitlement_grants").insert({
   teacher_id:users[0].id,kind:"plan_access",plan_version_id:planId,
   reason:"Synthetic independent plan access",request_id:randomUUID(),
  }).select("id").single();
  expect(grant.error).toBeNull();
  const eventId="evt_"+randomUUID();
  const providerEvent={
   provider:"synthetic",merchant_scope:merchantScope,
   external_event_id:eventId,external_subscription_id:"sub_"+randomUUID(),
   teacher_id:users[0].id,event_type:"subscription.updated",
   payload_sha256:"a".repeat(64),signature_verified_at:new Date().toISOString(),
  };
  const event=await admin.from("platform_billing_events").insert(providerEvent)
    .select("id").single();
  expect(event.error).toBeNull();
  const replay=await admin.from("platform_billing_events").insert(providerEvent);
  expect(replay.error?.code).toBe("23505");
  const clients=[];
  for(const user of users){
   const client=createClient(url,anonKey,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
   expect((await client.auth.signInWithPassword(user)).error).toBeNull();
   clients.push(client);
  }
  for(let i=0;i<clients.length;i++){
   const own=await clients[i].from("teacher_entitlement_state")
    .select("teacher_id,active_student_count");
   expect(own.error).toBeNull();
   expect(own.data).toEqual([{teacher_id:users[i].id,active_student_count:0}]);
   const foreign=await clients[i].from("teacher_entitlement_state")
    .select("teacher_id").eq("teacher_id",users[1-i].id);
   expect(foreign.error).toBeNull();
   expect(foreign.data).toEqual([]);
   const mutate=await clients[i].from("teacher_entitlement_state")
    .update({active_student_count:100}).eq("teacher_id",users[i].id);
   expect(mutate.error).not.toBeNull();
   const privateEvents=await clients[i].from("platform_billing_events")
    .select("id");
   expect(privateEvents.error).not.toBeNull();
  }
  const readGrant=await clients[0].from("teacher_entitlement_grants")
   .select("id");
  expect(readGrant.error).toBeNull();
  expect(readGrant.data?.map(x=>x.id)).toEqual([grant.data!.id]);
  const otherRead=await clients[1].from("teacher_entitlement_grants")
   .select("id");
  expect(otherRead.error).toBeNull();
  expect(otherRead.data).toEqual([]);
  const forged=await clients[0].from("teacher_entitlement_grants").insert({
   teacher_id:users[0].id,kind:"plan_access",plan_version_id:planId,
   reason:"Synthetic forbidden client grant",request_id:randomUUID(),
  });
  expect(forged.error).not.toBeNull();
 } finally {
  await admin.from("platform_billing_events").delete().eq("merchant_scope",merchantScope);
  for(const user of users)await admin.auth.admin.deleteUser(user.id);
  if(planId)await admin.from("plan_versions").delete().eq("id",planId);
 }
});
