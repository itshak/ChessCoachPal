import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";

test("commercial rows enforce populated owner, foreign, anonymous and service boundaries",async()=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
 const client=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const owner=client(),foreign=client(),anonymous=client();
 const userIds:string[]=[];
 const createTeacher=async(viewer:ReturnType<typeof client>)=>{
  const email="commercial-roles-"+randomUUID()+"@example.com",password="SyntheticRoles-123!";
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});
  expect(created.error).toBeNull();
  const id=created.data.user!.id;
  userIds.push(id);
  expect((await service.from("teachers").insert({id,email,display_name:"Synthetic role fixture"})).error)
   .toBeNull();
  expect((await viewer.auth.signInWithPassword({email,password})).error).toBeNull();
  return id;
 };
 const insert=async(table:string,values:Record<string,unknown>)=>{
  const result=await service.from(table).insert(values).select("id").single();
  expect(result.error,table+" service insert").toBeNull();
  return result.data!.id as string;
 };
 try{
  const teacher_id=await createTeacher(owner);
  await createTeacher(foreign);
  const pro=await service.from("plan_versions").select("id").eq("code","pro").eq("version",1).single();
  expect(pro.error).toBeNull();
  const grant={teacher_id,kind:"plan_access",plan_version_id:pro.data!.id,
   reason:"Synthetic approved entitlement",request_id:randomUUID()};
  const grantId=await insert("teacher_entitlement_grants",grant);
  const autoAudit=await service.from("entitlement_audit_events").select("id")
   .eq("teacher_id",teacher_id).eq("source","grant").eq("action","grant_issued").single();
  expect(autoAudit.error).toBeNull();
  const usage={teacher_id,capability_key:"students.active",
   period_start:"2040-01-01T00:00:00Z",period_end:"2040-02-01T00:00:00Z"};
  const period_id=await insert("account_usage_periods",usage);
  const usageEvent={teacher_id,period_id,capability_key:usage.capability_key,request_id:randomUUID(),
   unit:"synthetic_units",amount:3,source:"synthetic role fixture"};
  const usageEventId=await insert("account_usage_events",usageEvent);
  const provider="synthetic",merchant_scope="scope_"+randomUUID();
  const customer={teacher_id,provider,merchant_scope,external_customer_id:"customer_"+randomUUID()};
  const customer_id=await insert("platform_billing_customers",customer);
  const offer_id=await insert("platform_subscription_offers",{
   plan_version_id:pro.data!.id,provider,merchant_scope,external_price_id:"price_"+randomUUID(),
   currency:"USD",billing_interval:"month",effective_from:"2020-01-01T00:00:00Z",
  });
  const subscription={teacher_id,customer_id,offer_id,provider,merchant_scope,
   state:"trialing",external_subscription_id:"subscription_"+randomUUID(),
   latest_event_time:"2040-01-01T00:00:00Z"};
  const subscriptionId=await insert("platform_subscriptions",subscription);
  const billingEvent={teacher_id,provider,merchant_scope,external_event_id:"event_"+randomUUID(),
   external_subscription_id:subscription.external_subscription_id,event_type:"synthetic.event",
   payload_sha256:createHash("sha256").update("synthetic only").digest("hex"),
   signature_verified_at:"2040-01-01T00:00:00Z"};
  const billingEventId=await insert("platform_billing_events",billingEvent);
  const updatedAt="2040-01-02T00:00:00Z";
  const tables=[
   {table:"teacher_entitlement_state",key:"teacher_id",id:teacher_id,private:false,
    add:{teacher_id},patch:{evaluated_at:updatedAt}},
   {table:"teacher_entitlement_grants",key:"id",id:grantId,private:false,
    add:{...grant,request_id:randomUUID()},patch:{revoked_at:new Date().toISOString()}},
   {table:"entitlement_audit_events",key:"id",id:autoAudit.data!.id,private:false,
    add:{teacher_id,source:"operator",action:"synthetic_test",request_id:randomUUID(),reason:"Synthetic audit"},
    patch:{reason:"Forbidden audit rewrite"},immutable:true},
   {table:"account_usage_periods",key:"id",id:period_id,private:false,
    add:{...usage,period_start:"2040-02-01T00:00:00Z",period_end:"2040-03-01T00:00:00Z"},
    patch:{reserved_count:1}},
   {table:"account_usage_events",key:"id",id:usageEventId,private:false,
    add:{...usageEvent,request_id:randomUUID()},patch:{amount:4},immutable:true},
   {table:"platform_billing_customers",key:"id",id:customer_id,private:true,
    add:{...customer,external_customer_id:"other_"+randomUUID()},patch:{disabled_at:updatedAt}},
   {table:"platform_subscriptions",key:"id",id:subscriptionId,private:false,
    add:{...subscription,external_subscription_id:"other_"+randomUUID()},
    patch:{state:"expired",latest_event_time:updatedAt}},
   {table:"platform_billing_events",key:"id",id:billingEventId,private:true,
    add:{...billingEvent,external_event_id:"other_"+randomUUID()},patch:{processing_state:"ignored"}},
  ];
  for(const {table,key,id,private:isPrivate,add,patch,immutable} of tables){
   const actual=await service.from(table).select("*").eq(key,id).single();
   expect(actual.error,table+" service populated read").toBeNull();
   for(const [role,db] of [["owner",owner],["foreign",foreign],["anonymous",anonymous]] as const){
    const context=table+" "+role;
    const read=await db.from(table).select("*").eq(key,id);
    if(role==="anonymous"||isPrivate)expect(read.error?.code,context+" read").toBe("42501");
    else{
     expect(read.error,context+" read").toBeNull();
     expect(read.data,context+" read").toEqual(role==="owner"?[actual.data]:[]);
    }
    for(const [operation,result] of [
     ["insert",await db.from(table).insert(add)],
     ["update",await db.from(table).update(patch).eq(key,id)],
     ["delete",await db.from(table).delete().eq(key,id)],
    ] as const)expect(result.error?.code,context+" "+operation).toBe("42501");
   }
   const unchanged=await service.from(table).select("*").eq(key,id).single();
   expect(unchanged.error,table+" read after denials").toBeNull();
   expect(unchanged.data,table+" persisted result after denials").toEqual(actual.data);
   const changed=await service.from(table).update(patch).eq(key,id)
    .select(Object.keys(patch).join(",")).single();
   if(immutable){
    expect(changed.error,table+" immutable update").toMatchObject({code:"23514",message:"IMMUTABLE_EVENT"});
    const removal=await service.from(table).delete().eq(key,id);
    expect(removal.error,table+" immutable delete").toMatchObject({code:"23514",message:"IMMUTABLE_EVENT"});
   }else{
    expect(changed.error,table+" service scoped update").toBeNull();
    // Timestamp strings are returned in Postgres representation; SQL could
    // have altered the revision, but each supplied field must round-trip.
    for(const [field,expected] of Object.entries(patch)){
     const value=(changed.data as unknown as Record<string,unknown>)[field];
     const isTimestamp=field.endsWith("_at")||field==="latest_event_time";
     const normalize=(input:unknown)=>isTimestamp?new Date(String(input)).toISOString():input;
     expect(normalize(value),table+" "+field).toEqual(normalize(expected));
    }
   }
  }
  const counted=await owner.from("account_usage_periods").select("used_count,reserved_count").eq("id",period_id).single();
  expect(counted.error).toBeNull();
  expect(counted.data).toEqual({used_count:3,reserved_count:1});
  const eventIdentity=await service.from("platform_billing_events")
   .update({external_event_id:"replacement_"+randomUUID()}).eq("id",billingEventId);
  expect(eventIdentity.error).toMatchObject({code:"23514",message:"EVENT_IDENTITY_IMMUTABLE"});
  const removedEvent=await service.from("platform_billing_events").delete().eq("id",billingEventId);
  expect(removedEvent.error).toMatchObject({code:"23514",message:"IMMUTABLE_EVENT"});
 }finally{
  for(const id of userIds.reverse())expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
