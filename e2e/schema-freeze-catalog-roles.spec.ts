import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";

type Db=ReturnType<typeof client>;
type Contract={
 table:string; compare:string; key:string; keys:string[];
 mutable:Record<string,string>; insert:Record<string,unknown>; change:Record<string,unknown>;
 visible:string[]; hidden:string[];
};
function client(service=false){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,service?process.env.SUPABASE_SERVICE_ROLE_KEY!:
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function actors(){
 const admin=client(true),anonymous=client(),teachers:Db[]=[],ids:string[]=[];
 try{
  for(const label of ["owner","foreign"]){
   const email="catalog-"+label+"-"+randomUUID()+"@example.com",password="SyntheticCatalogRole-123!";
   const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
   expect(identity.error).toBeNull();
   const id=identity.data.user!.id;
   ids.push(id);
   expect((await admin.from("teachers").insert({id,email,display_name:"Synthetic "+label})).error).toBeNull();
   const signed=client();
   const login=await signed.auth.signInWithPassword({email,password});
   expect(login.error).toBeNull();
   expect(login.data.user?.id).toBe(id);
   teachers.push(signed);
  }
 }catch(error){
  for(const id of ids)await admin.auth.admin.deleteUser(id);
  throw error;
 }
 return {admin,anonymous,teachers,ids,cleanup:async()=>{
  for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }};
}
async function exercise(admin:Db,anon:Db,teachers:Db[],config:Contract){
 const {table,compare,key,keys,mutable,insert,change,visible,hidden}=config;
 const projection=async(db:Db)=>db.from(table).select(compare).in(key,keys);
 const byKey=(data:unknown)=>((data??[]) as Record<string,string>[]).map(row=>row[compare]).sort();
 const recorded=await projection(admin);
 expect(recorded.error,table+" service read").toBeNull();
 for(const item of [...visible,...hidden])expect(byKey(recorded.data),table).toContain(item);
 for(const [role,db] of [["owner",teachers[0]],["foreign",teachers[1]],["anonymous",anon]] as const){
  const read=await projection(db);
  if(role==="anonymous"){
   expect(read.error?.code,table+" anonymous read").toBe("42501");
   expect(read.data).toBeNull();
  }else{
   expect(read.error,table+" "+role+" read").toBeNull();
   for(const item of visible)expect(byKey(read.data),table+" "+role).toContain(item);
   for(const item of hidden)expect(byKey(read.data),table+" "+role).not.toContain(item);
  }
  const operations=[["insert",db.from(table).insert(insert)],
   ["update",db.from(table).update(change).match(mutable)],
   ["delete",db.from(table).delete().match(mutable)]] as const;
  for(const [operation,attempt] of operations){
   const denied=await attempt;
   expect(denied.error?.code,table+" "+role+" "+operation).toBe("42501");
  }
 }
 const before=await admin.from(table).select("*").match(mutable).single();
 expect(before.error,table+" unchanged fixture").toBeNull();
 const changed=await admin.from(table).update(change).match(mutable).select("*").single();
 expect(changed.error,table+" service update").toBeNull();
 expect(changed.data).toMatchObject(change);
}

test("product catalogue: approved shared reads, hidden operator/draft rows and service-only writes",async()=>{
 const {admin,anonymous,teachers,cleanup}=await actors();
 const suffix=randomUUID().replaceAll("-","").slice(0,12);
 const capability=(name:string,active=true,security_class="teacher")=>({
  key:`qa.${suffix}.${name}`,kind:"boolean",active,security_class,
 });
 const pub=capability("pub"),oper=capability("operator",true,"operator"),disabled=capability("disabled",false),
  spare=capability("spare");
 const plan=(name:string)=>({id:randomUUID(),code:`q${suffix}_${name}`,version:1,lifecycle:"draft"});
 const live=plan("visible"),draft=plan("draft"),freeSpare=plan("spare");
 const cap=(id:string,key:string)=>({plan_version_id:id,capability_key:key,capability_kind:"boolean",boolean_value:true,unlimited:false});
 const offer=(plan_version_id:string,external_price_id:string,effective_from="2020-01-01T00:00:00Z",effective_to:string|null=null)=>({
  id:randomUUID(),plan_version_id,provider:"synthetic",merchant_scope:"synthetic_"+suffix,
  external_price_id,currency:"USD",billing_interval:"month",effective_from,effective_to,
 });
 const offerLive=offer(live.id,"synthetic-visible"),offerDraft=offer(draft.id,"synthetic-draft"),
  offerExpired=offer(live.id,"synthetic-expired","2020-01-01T00:00:00Z","2021-01-01T00:00:00Z"),
  offerFuture=offer(live.id,"synthetic-future","2089-01-01T00:00:00Z");
 try{
  expect((await admin.from("capability_definitions").insert([pub,oper,disabled,spare])).error).toBeNull();
  expect((await admin.from("plan_versions").insert([live,draft,freeSpare])).error).toBeNull();
  expect((await admin.from("plan_capabilities").insert(cap(draft.id,disabled.key))).error)
   .toMatchObject({code:"23514",message:"CAPABILITY_UNAVAILABLE"});
  expect((await admin.from("plan_capabilities").insert([cap(live.id,pub.key),cap(live.id,oper.key),cap(draft.id,pub.key)])).error).toBeNull();
  expect((await admin.from("plan_versions").update({lifecycle:"published",effective_at:"2020-01-01T00:00:00Z"}).eq("id",live.id)).error).toBeNull();
  expect((await admin.from("platform_subscription_offers").insert([offerLive,offerDraft,offerExpired,offerFuture])).error).toBeNull();
  await exercise(admin,anonymous,teachers,{table:"capability_definitions",key:"key",compare:"key",
   keys:[pub.key,oper.key,disabled.key],visible:[pub.key],hidden:[oper.key,disabled.key],
   mutable:{key:spare.key},insert:capability("forbidden"),change:{unit:"little_unit"}});
  await exercise(admin,anonymous,teachers,{table:"plan_versions",key:"id",compare:"id",
   keys:[live.id,draft.id],visible:[live.id],hidden:[draft.id],
   mutable:{id:freeSpare.id},insert:plan("forbidden"),change:{version:2}});
  const capKeys=(db:Db,id:string)=>db.from("plan_capabilities").select("capability_key").eq("plan_version_id",id);
  for(const db of teachers){
   const publicCaps=await capKeys(db,live.id),hiddenCaps=await capKeys(db,draft.id);
   expect(publicCaps.error).toBeNull();
   expect(publicCaps.data).toEqual([{capability_key:pub.key}]);
   expect(hiddenCaps.error).toBeNull();
   expect(hiddenCaps.data).toEqual([]);
  }
  await exercise(admin,anonymous,teachers,{table:"plan_capabilities",key:"plan_version_id",compare:"capability_key",
   keys:[live.id,draft.id],visible:[pub.key],hidden:[oper.key],
   mutable:{plan_version_id:draft.id,capability_key:pub.key},insert:cap(draft.id,oper.key),change:{boolean_value:false}});
  await exercise(admin,anonymous,teachers,{table:"platform_subscription_offers",key:"id",compare:"id",
   keys:[offerLive.id,offerDraft.id],visible:[offerLive.id],hidden:[offerDraft.id],
   mutable:{id:offerDraft.id},insert:offer(draft.id,"synthetic-forbidden"),change:{currency:"EUR"}});
  const badWindow=await admin.from("platform_subscription_offers").insert(
   offer(draft.id,"synthetic-invalid-window","2030-01-01T00:00:00Z","2020-01-01T00:00:00Z"));
  expect(badWindow.error?.code).toBe("23514");
  expect((await admin.from("plan_capabilities").update({boolean_value:false}).match({plan_version_id:live.id,capability_key:pub.key})).error)
   .toMatchObject({code:"23514",message:"PUBLISHED_CAPABILITY_IMMUTABLE"});
  expect((await admin.from("capability_definitions").update({active:false}).eq("key",pub.key)).error)
   .toMatchObject({code:"23514",message:"CAPABILITY_CONTRACT_IMMUTABLE"});

  // Published offer metadata is a catalogue, not current checkout eligibility.
  const listed=[offerLive,offerExpired,offerFuture].map(offer=>offer.id).sort();
  for(const [index,db] of teachers.entries()){
   const publicOffer=await db.from("platform_subscription_offers")
    .select("id,plan_version_id,provider,currency,billing_interval,effective_from,effective_to,created_at")
    .in("id",[...listed,offerDraft.id]).order("id");
   expect(publicOffer.error,"teacher "+index+" public offer columns").toBeNull();
   expect(publicOffer.data?.map(row=>row.id)).toEqual(listed);
   expect(publicOffer.data?.every(row=>row.plan_version_id===live.id&&row.currency==="USD")).toBe(true);
   expect(publicOffer.data?.find(row=>row.id===offerExpired.id)?.effective_to).toBe("2021-01-01T00:00:00+00:00");
   expect(publicOffer.data?.find(row=>row.id===offerFuture.id)?.effective_from).toBe("2089-01-01T00:00:00+00:00");
   for(const key of ["merchant_scope","external_price_id"]){
    const hiddenColumn=await db.from("platform_subscription_offers").select("id,"+key).eq("id",offerLive.id);
    expect(hiddenColumn.error?.code,"teacher "+index+" "+key).toBe("42501");
    expect(hiddenColumn.data).toBeNull();
   }
  }
  const routing=await admin.from("platform_subscription_offers").select("merchant_scope,external_price_id").eq("id",offerLive.id).single();
  expect(routing.error).toBeNull();
  expect(routing.data).toEqual({merchant_scope:offerLive.merchant_scope,external_price_id:offerLive.external_price_id});
  expect((await admin.from("platform_subscription_offers").delete().eq("id",offerDraft.id).select("id").single()).data?.id).toBe(offerDraft.id);
  expect((await admin.from("plan_capabilities").delete().match({plan_version_id:draft.id,capability_key:pub.key})
   .select("capability_key").single()).data?.capability_key).toBe(pub.key);
  expect((await admin.from("plan_versions").delete().eq("id",freeSpare.id).select("id").single()).data?.id).toBe(freeSpare.id);
  expect((await admin.from("capability_definitions").delete().eq("key",spare.key).select("key").single()).data?.key).toBe(spare.key);
 }finally{await cleanup();}
});

test("ratings registry: active shared rows, explicitly disabled rows and service-only validated writes",async()=>{
 const {admin,anonymous,teachers,cleanup}=await actors();
 const suffix=randomUUID().replaceAll("-","").slice(0,12);
 const provider=(name:string,active=true)=>({code:`q${suffix}_${name}`,display_name:"Synthetic "+name,provider_kind:"federation",active});
 const active=provider("active"),inactive=provider("inactive",false),spare=provider("spare");
 const category=(provider_code:string,code:string,active=true)=>({provider_code,code,display_name:"Synthetic "+code,active});
 const rapid=category(active.code,"rapid"),hidden=category(active.code,"hidden",false),
  disabledParent=category(inactive.code,"observation"),mutable=category(active.code,"mutable");
 try{
  expect((await admin.from("rating_providers").insert([active,inactive,spare])).error).toBeNull();
  expect((await admin.from("rating_categories").insert([rapid,hidden,disabledParent,mutable])).error).toBeNull();
  await exercise(admin,anonymous,teachers,{table:"rating_providers",key:"code",compare:"code",
   keys:[active.code,inactive.code],visible:[active.code],hidden:[inactive.code],
   mutable:{code:spare.code},insert:provider("forbidden"),change:{display_name:"Edited synthetic provider"}});
  await exercise(admin,anonymous,teachers,{table:"rating_categories",key:"provider_code",compare:"code",
   keys:[active.code],visible:[rapid.code],hidden:[hidden.code],
   mutable:{provider_code:active.code,code:mutable.code},insert:category(active.code,"forbidden"),
   change:{display_name:"Edited synthetic category"}});
  const invalidParent=await admin.from("rating_categories").insert(category("unregistered_"+suffix,"rapid"));
  expect(invalidParent.error?.code).toBe("23503");
  const invalidKind=await admin.from("rating_providers").insert({...provider("unknown"),provider_kind:"other"});
  expect(invalidKind.error?.code).toBe("23514");
  // Observe parent/category independence without treating it as policy approval.
  const parentObservation=await teachers[0].from("rating_categories").select("code")
   .eq("provider_code",inactive.code).eq("code",disabledParent.code);
  const categoryNote=JSON.stringify({data:parentObservation.data,error:parentObservation.error?.code??null});
  console.log("CATALOG_OBSERVED_CATEGORY "+categoryNote);
  await test.info().attach("observed-rating-parent-projection",{body:categoryNote,contentType:"application/json"});
  expect((await admin.from("rating_categories").delete().match({provider_code:active.code,code:mutable.code})
   .select("code").single()).data?.code).toBe(mutable.code);
  expect((await admin.from("rating_providers").delete().eq("code",spare.code).select("code").single()).data?.code).toBe(spare.code);
 }finally{await cleanup();}
});
