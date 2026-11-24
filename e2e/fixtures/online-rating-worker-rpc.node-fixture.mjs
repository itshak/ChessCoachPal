// Run only against a disposable loopback Supabase fixture. No provider URL is contacted.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {registerHooks} from "node:module";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";

const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==="server-only")return {shortCircuit:true,url:"data:text/javascript,export%20%7B%7D"};
 if(["../chess-public-ratings","./online-rating-transport"].includes(specifier))return next(specifier+".ts",context);
 return next(specifier,context);
}});
const {runOnlineRatingLease}=await import("../../lib/server/online-rating-worker.ts");
const {fetchOnlineRatingPayload}=await import("../../lib/server/online-rating-transport.ts");
hooks.deregister();
const origin=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert(origin.protocol==="http:"&&origin.hostname==="127.0.0.1"&&origin.port&&origin.href===origin.origin+"/");
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
const admin=createClient(origin.origin,process.env.SUPABASE_SERVICE_ROLE_KEY,{
 auth:{persistSession:false,autoRefreshToken:false},
});
async function data(request){
 const result=await request;
 if(result.error)throw result.error;
 return result.data;
}
const handle="SyntheticWorkerProbe";
const inputDigest="a".repeat(64);

async function setup(t,provider="lichess"){
 const email="worker-fixture-"+randomUUID()+"@example.com";
 const {user}=await data(admin.auth.admin.createUser({email,password:"Synthetic-Ratings-123!",email_confirm:true}));
 const teacherId=user.id;
 t.after(async()=>{
  await data(admin.from("student_rating_snapshots").delete().eq("teacher_id",teacherId));
  await data(admin.auth.admin.deleteUser(teacherId));
 });
 await data(admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic rating teacher"}));
 const student=await data(admin.from("students").insert({
  teacher_id:teacherId,name:"Synthetic rating student",lichess_username:handle,chesscom_username:handle,
 }).select("id").single());
 const studentId=student.id;
 const consent=await data(admin.from("student_rating_sync_consents").insert({
  teacher_id:teacherId,student_id:studentId,provider,source_username:handle,
  enabled:true,consented_at:"2024-01-01T00:00:00.000Z",
 }).select("id").single());
 const consentId=consent.id;
 const {id:jobId}=await data(admin.from("student_rating_refresh_jobs").insert({
  teacher_id:teacherId,student_id:studentId,consent_id:consentId,provider,
  source_username:handle,handle_revision:1,input_digest:inputDigest,idempotency_key:randomUUID(),trigger_kind:"manual",
 }).select("id").single());
 const ids={teacherId,jobId};
 const db=()=>({
  job:()=>data(admin.from("student_rating_refresh_jobs")
   .select("status,attempt_count,lease_token,lease_until,run_after").eq("id",jobId).single()),
  receipts:()=>data(admin.from("student_rating_refresh_receipts")
   .select("outcome,snapshots_written,error_code").eq("job_id",jobId)),
  snapshots:()=>data(admin.from("student_rating_snapshots")
   .select("provider,time_control,rating,source,verification_state,source_handle_revision").eq("student_id",studentId)),
 });
 let enabled=true;
 let providerRequests=0;
 const disable=()=>{enabled=false;};
 const revoke=()=>data(admin.from("student_rating_sync_consents").update({enabled:false,revoked_at:new Date().toISOString()}).eq("id",consentId));
 const deps={
  enabled:()=>enabled,
  claim:({teacherId,jobId})=>data(admin.rpc("ccp_rating_refresh_claim",{p_teacher_id:teacherId,p_job_id:jobId})),
  admit:async lease=>{
   // Fixture-only re-read; a future production admission adapter requires separate review.
   const [{archived_at,lichess_username,chesscom_username},binding,job,registry]=await Promise.all([
    data(admin.from("students").select("archived_at,lichess_username,chesscom_username")
     .eq("teacher_id",teacherId).eq("id",studentId).single()),
    data(admin.from("student_rating_sync_consents").select("id,enabled,revoked_at,source_username,handle_revision")
     .eq("teacher_id",teacherId).eq("student_id",studentId).eq("provider",provider).single()),
    db().job(),
    data(admin.from("rating_providers").select("provider_kind,active").eq("code",provider).single()),
   ]);
   return archived_at===null&&lease.studentId===studentId&&binding.id===consentId&&binding.enabled&&
    binding.revoked_at===null&&binding.source_username===lease.sourceUsername&&binding.handle_revision===lease.handleRevision&&
    registry.active&&registry.provider_kind==="online"&&
    (provider==="lichess"?lichess_username:chesscom_username)===lease.sourceUsername&&
    job.status==="running"&&job.lease_token===lease.leaseToken&&job.attempt_count===lease.attempt&&
    Date.parse(job.lease_until)>Date.now();
  },
  transport:(key,username)=>fetchOnlineRatingPayload(key,username,async url=>{
   providerRequests++;
   assert.equal(url,key==="lichess"?"https://lichess.org/api/user/"+handle:
    "https://api.chess.com/pub/player/"+handle+"/stats");
   return key==="lichess"?Response.json({perfs:{rapid:{rating:1725,prov:false}}}):new Response(null,{status:429});
  },{}),
  finalize:attempt=>data(admin.rpc("ccp_rating_refresh_finalize",attempt)),
 };
 return {ids,deps,db,disable,revoke,requests:()=>providerRequests};
}

test("synthetic canonical worker success and temporary provider result",async t=>{
 const success=await setup(t);
 assert.deepEqual(await runOnlineRatingLease(success.ids,success.deps),{
  status:"finalized",outcome:"succeeded",snapshotsWritten:1,
 });
 assert.equal(success.requests(),1);
 assert.deepEqual(await success.db().snapshots(),[{
  provider:"lichess",time_control:"rapid",rating:1725,source:"provider_api",
  verification_state:"unverified",source_handle_revision:1,
 }]);
 assert.deepEqual(await success.db().receipts(),[{outcome:"succeeded",snapshots_written:1,error_code:null}]);
 assert.deepEqual(await runOnlineRatingLease(success.ids,success.deps),{status:"not_admitted"});
 assert.equal(success.requests(),1);

 const limited=await setup(t,"chesscom");
 assert.deepEqual(await runOnlineRatingLease(limited.ids,limited.deps),{
  status:"finalized",outcome:"retry",snapshotsWritten:0,
 });
 assert.equal(limited.requests(),1);
 assert.deepEqual(await limited.db().snapshots(),[]);
 assert.deepEqual(await limited.db().receipts(),[{outcome:"retry",snapshots_written:0,error_code:"RATE_LIMITED"}]);
 const retry=await limited.db().job();
 assert.equal(retry.lease_token,null);
 assert.ok(Date.parse(retry.run_after)>Date.now());
});

test("synthetic operator stop after claiming or egress does not terminate or emit evidence",async t=>{
 for(const phase of ["claim","transport"]){
  const f=await setup(t);
  assert.deepEqual(await runOnlineRatingLease(f.ids,{...f.deps,enabled:undefined}),{status:"disabled"});
  assert.equal((await f.db().job()).attempt_count,0);
  const callback=f.deps[phase];
  f.deps[phase]=async(...args)=>{const result=await callback(...args);f.disable();return result;};
  assert.deepEqual(await runOnlineRatingLease(f.ids,f.deps),{status:"disabled"});
  assert.equal(f.requests(),phase==="claim"?0:1);
  assert.equal((await f.db().job()).status,"running");
  assert.deepEqual(await f.db().receipts(),[]);
  assert.deepEqual(await f.db().snapshots(),[]);
 }
});

test("confirmed revocation before the fresh recheck stops egress; during egress canonical finalize refuses evidence",async t=>{
 for(const phase of ["claim","transport"]){
  const f=await setup(t);
  const callback=f.deps[phase];
  f.deps[phase]=async(...args)=>{const result=await callback(...args);await f.revoke();return result;};
  assert.deepEqual(await runOnlineRatingLease(f.ids,f.deps),phase==="claim"?{status:"not_admitted"}:
   {status:"finalized",outcome:"stale",snapshotsWritten:0});
  assert.equal(f.requests(),phase==="claim"?0:1);
  assert.deepEqual(await f.db().snapshots(),[]);
  assert.deepEqual(await f.db().receipts(),phase==="claim"?[]:
   [{outcome:"stale",snapshots_written:0,error_code:"RATING_CONTEXT_STALE"}]);
 }
});
