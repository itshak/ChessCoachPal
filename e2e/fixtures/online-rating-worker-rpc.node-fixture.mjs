// Run only against a disposable loopback Supabase fixture. No provider URL is contacted.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {registerHooks} from "node:module";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";

const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==="server-only")return {shortCircuit:true,url:"data:text/javascript,export%20%7B%7D"};
 if(["../chess-public-ratings","./online-rating-transport","./online-rating-cooldown","./online-rating-worker","./online-rating-queue","./online-rating-provider-budget",
  "./online-rating-worker-authority","./online-rating-batch"].includes(specifier))return next(specifier+".ts",context);
 return next(specifier,context);
}});
const {runOnlineRatingLease}=await import("../../lib/server/online-rating-worker.ts");
const {fetchOnlineRatingPayload}=await import("../../lib/server/online-rating-transport.ts");
const {onlineRatingWorkerAuthority}=await import("../../lib/server/online-rating-worker-authority.ts");
const {onlineRatingQueueDiscovery}=await import("../../lib/server/online-rating-queue.ts");
const {onlineRatingProviderBudget,runOnlineRatingCandidateWithBudget}=await import("../../lib/server/online-rating-provider-budget.ts");
const {runOnlineRatingBatch}=await import("../../lib/server/online-rating-batch.ts");
const {runOnlineRatingOperatorPass}=await import("../../lib/server/online-rating-operator-pass.ts");
hooks.deregister();
const origin=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert(origin.protocol==="http:"&&origin.hostname==="127.0.0.1"&&origin.port&&origin.href===origin.origin+"/");
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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

async function setup(t,provider="lichess",triggerKind="manual"){
 const email="worker-fixture-"+randomUUID()+"@example.com";
 const {user}=await data(admin.auth.admin.createUser({email,password:"Synthetic-Ratings-123!",email_confirm:true}));
 const teacherId=user.id;
 t.after(async()=>{
  await data(admin.from("student_rating_snapshots").delete().eq("teacher_id",teacherId));
  await data(admin.auth.admin.deleteUser(teacherId));
 });
 await data(admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic rating teacher"}));
 const teacher=createClient(origin.origin,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 await data(teacher.auth.signInWithPassword({email,password:"Synthetic-Ratings-123!"}));
 const student=await data(teacher.from("students").insert({
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
  source_username:handle,handle_revision:1,input_digest:inputDigest,idempotency_key:randomUUID(),trigger_kind:triggerKind,
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
  ...onlineRatingWorkerAuthority(admin),
  transport:(key,username)=>fetchOnlineRatingPayload(key,username,async url=>{
   providerRequests++;
   assert.equal(url,key==="lichess"?"https://lichess.org/api/user/"+handle:
    "https://api.chess.com/pub/player/"+handle+"/stats");
   return key==="lichess"?Response.json({perfs:{rapid:{rating:1725,prov:false}}}):new Response(null,{status:429});
  },{}),
 };
 return {ids,deps,db,disable,revoke,studentId,teacher,requests:()=>providerRequests};
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

test("unsupported backfill is not claimed, finalized, or sent",async t=>{
 const fixture=await setup(t,"lichess","history_backfill");
 assert.deepEqual(await runOnlineRatingLease(fixture.ids,fixture.deps),{status:"not_admitted"});
 assert.equal(fixture.requests(),0);
 assert.equal((await fixture.db().job()).attempt_count,0);
 assert.deepEqual(await fixture.db().receipts(),[]);
 assert.deepEqual(await fixture.db().snapshots(),[]);
});

test("real due discovery orders expired and ready work without touching future or backfill jobs",async t=>{
 const ready=await setup(t);
 const expired=await setup(t);
 const future=await setup(t);
 const backfill=await setup(t,"lichess","history_backfill");
 const other=await setup(t,"chesscom");
 const at=Date.now();
 const time=delta=>new Date(at+delta).toISOString();
 const set=(f,fields)=>data(admin.from("student_rating_refresh_jobs").update(fields).eq("id",f.ids.jobId));
 await set(ready,{status:"retry",run_after:time(-1000)});
 await set(expired,{status:"running",lease_token:randomUUID(),lease_until:time(-60000),attempt_count:1});
 await set(future,{status:"pending",run_after:time(60000)});
 await set(backfill,{status:"pending",run_after:time(-86400000)});
 await set(other,{status:"pending",run_after:time(-1000)});
 const discover=onlineRatingQueueDiscovery(admin,()=>at);
 const candidate=(fixture,provider)=>({...fixture.ids,provider});
 assert.deepEqual(await discover("lichess",2),[candidate(expired,"lichess"),candidate(ready,"lichess")]);
 assert.deepEqual(await discover("chesscom",1),[candidate(other,"chesscom")]);
 assert.equal((await backfill.db().job()).attempt_count,0);
 assert.equal((await ready.db().job()).attempt_count,0);
 assert.equal((await expired.db().job()).status,"running");
});

test("real shared reservations gate the worker and persist cooldown without actual provider traffic",
 {skip:process.env.CCP_DISPOSABLE_RATINGS_BUDGET!=="yes"},async t=>{
 const lichess=await setup(t);
 const chesscom=await setup(t,"chesscom");
 const budget=onlineRatingProviderBudget(admin);
 const read=(provider)=>data(admin.from("online_rating_provider_budget")
  .select("daily_used,monthly_used,request_token,blocked_until").eq("provider",provider).single());
 const publicClient=createClient(origin.origin,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 assert.ok((await publicClient.rpc("ccp_online_rating_budget_acquire",{p_provider:"lichess"})).error);
 assert.ok((await admin.from("online_rating_provider_budget").update({enabled:false}).eq("provider","lichess")).error);
 assert.deepEqual(await runOnlineRatingCandidateWithBudget({...lichess.ids,provider:"lichess"},{...lichess.deps,budget}),
  {status:"finalized",outcome:"succeeded",snapshotsWritten:1});
 assert.equal(lichess.requests(),1);
 assert.equal((await read("lichess")).request_token,null);
 assert.equal((await read("lichess")).daily_used,1);
 const withheld=await setup(t);
 assert.deepEqual(await runOnlineRatingCandidateWithBudget({...withheld.ids,provider:"lichess"},{...withheld.deps,budget}),
  {status:"budget_withheld"});
 assert.equal((await withheld.db().job()).attempt_count,0);
 assert.equal(withheld.requests(),0);
 const start=Date.now();
 assert.deepEqual(await runOnlineRatingCandidateWithBudget({...chesscom.ids,provider:"chesscom"},{...chesscom.deps,budget}),
  {status:"finalized",outcome:"retry",snapshotsWritten:0});
 assert.equal(chesscom.requests(),1);
 const held=await read("chesscom");
 assert.equal(held.request_token,null);
 assert.equal(held.monthly_used,1);
 assert.ok(Date.parse(held.blocked_until)>=start+120_000);
 assert.deepEqual(await budget.acquire("chesscom"),{status:"cooling_down"});
});

test("recurring runner enqueues only eligible current consent and sends one safely budgeted mock request",
 {skip:process.env.CCP_DISPOSABLE_RATINGS_RECURRENCE!=="yes"},async t=>{
 const eligible=await setup(t), recentlyFetched=await setup(t), revoked=await setup(t),
  active=await setup(t), other=await setup(t,"chesscom");
 const time=hours=>new Date(Date.now()-hours*3_600_000).toISOString();
 async function terminal(f,finishedHoursAgo){
  await data(admin.from("student_rating_refresh_jobs").update({
   status:"succeeded",created_at:time(36),finished_at:time(finishedHoursAgo),
  }).eq("id",f.ids.jobId));
 }
 await terminal(eligible,25);
 await terminal(recentlyFetched,23);
 await terminal(revoked,25);
 await terminal(other,25);
 await revoked.revoke();
 const providers={lichess:{enqueue:8,work:0},chesscom:{enqueue:8,work:2}};
 const request={p_provider:"lichess",p_limit:8};
 const anonymous=createClient(origin.origin,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 assert.ok((await anonymous.rpc("ccp_online_rating_enqueue_due",request)).error);
 assert.ok((await eligible.teacher.rpc("ccp_online_rating_enqueue_due",request)).error);
 const deps={db:admin,transport:eligible.deps.transport,enabled:()=>true,providerEnabled:key=>key==="lichess"};
 const jobs=(f)=>data(admin.from("student_rating_refresh_jobs").select("status,attempt_count")
  .eq("student_id",f.studentId).eq("trigger_kind","scheduled"));
 assert.equal((await runOnlineRatingBatch(providers,{...deps,enabled:undefined})).status,"disabled");
 assert.deepEqual(await jobs(eligible),[]);
 assert.deepEqual(await runOnlineRatingBatch(providers,deps),{
  status:"ran",checked:1,queued:1,scanned:0,submitted:0,finalized:0,withheld:0,unavailable:0,
 });
 assert.deepEqual(await jobs(eligible),[{status:"pending",attempt_count:0}]);
 for(const f of [recentlyFetched,revoked,active,other])assert.deepEqual(await jobs(f),[]);
 assert.equal(eligible.requests(),0);
 // Make the unrelated in-flight job non-due without changing its active status.
 await data(admin.from("student_rating_refresh_jobs").update({run_after:time(-1)}).eq("id",active.ids.jobId));
 const work={...providers,lichess:{enqueue:8,work:2}};
 assert.deepEqual(await runOnlineRatingBatch(work,deps),{
  status:"ran",checked:0,queued:0,scanned:1,submitted:1,finalized:1,withheld:0,unavailable:0,
 });
 assert.deepEqual(await jobs(eligible),[{status:"succeeded",attempt_count:1}]);
 assert.equal((await eligible.db().snapshots()).length,1);
 assert.equal(eligible.requests(),1);
 assert.deepEqual(await runOnlineRatingBatch(work,deps),{
  status:"ran",checked:0,queued:0,scanned:0,submitted:0,finalized:0,withheld:0,unavailable:0,
 });
 assert.equal(eligible.requests(),1);
});

test("trusted operator pass uses only its selected provider in disposable PostgREST",
 {skip:process.env.CCP_DISPOSABLE_RATINGS_OPERATOR!=="yes"},async t=>{
 const selected=await setup(t,"lichess"),other=await setup(t,"chesscom");
 const transport=selected.deps.transport;
 const input={provider:"lichess",confirmed:true,enqueue:0,work:1};
 const deps={db:admin,transport};
 assert.deepEqual(await runOnlineRatingOperatorPass(input,deps),{status:"disabled"});
 assert.deepEqual(await runOnlineRatingOperatorPass({...input,work:3},deps),{status:"invalid"});
 assert.equal((await selected.db().job()).attempt_count,0);
 assert.equal((await other.db().job()).attempt_count,0);
 assert.equal(selected.requests(),0);
 const reviewed={...deps,isAllowed:scope=>scope.provider==="lichess"&&scope.work===1&&scope.enqueue===0};
 assert.deepEqual(await runOnlineRatingOperatorPass(input,reviewed),{
  status:"ran",checked:0,queued:0,scanned:1,submitted:1,finalized:1,withheld:0,unavailable:0,
 });
 assert.equal((await selected.db().job()).status,"succeeded");
 assert.equal((await selected.db().snapshots()).length,1);
 assert.equal(selected.requests(),1);
 assert.equal((await other.db().job()).status,"pending");
 assert.equal((await other.db().job()).attempt_count,0);
 assert.deepEqual(await other.db().snapshots(),[]);
 assert.deepEqual(await runOnlineRatingOperatorPass(input,reviewed),{
  status:"ran",checked:0,queued:0,scanned:0,submitted:0,finalized:0,withheld:0,unavailable:0,
 });
 assert.equal(selected.requests(),1);
});
