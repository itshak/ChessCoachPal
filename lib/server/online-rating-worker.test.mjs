import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {registerHooks} from "node:module";
import test from "node:test";

const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==="server-only")return {shortCircuit:true,url:"data:text/javascript,export%20%7B%7D"};
 if(["../chess-public-ratings","./online-rating-transport","./online-rating-cooldown"].includes(specifier))return next(specifier+".ts",context);
 return next(specifier,context);
}});
const {runOnlineRatingLease}=await import("./online-rating-worker.ts");
const {fetchOnlineRatingPayload}=await import("./online-rating-transport.ts");
hooks.deregister();

const now=Date.parse("2026-02-03T12:00:00Z");
const ids={teacherId:randomUUID(),jobId:randomUUID()};
const lease={...ids,studentId:randomUUID(),provider:"lichess",sourceUsername:"SyntheticHandle",
 handleRevision:1,inputDigest:"a".repeat(64),triggerKind:"manual",attempt:1,
 leaseToken:randomUUID(),leaseUntil:new Date(now+120_000).toISOString()};
const rated={perfs:{rapid:{rating:1752,rd:40,prov:false,games:18}}};
function fixture(){
 const trace=[], attempts=[];
 const deps={
  enabled:()=>true,claim:async candidate=>{trace.push("claim");assert.deepEqual(candidate,ids);return lease;},
  admit:async bound=>{trace.push("admit");assert.deepEqual(bound,lease);return true;},
  transport:async(provider,username)=>{trace.push("transport");assert.equal(provider,"lichess");assert.equal(username,lease.sourceUsername);return rated;},
  finalize:async attempt=>{trace.push("finalize");attempts.push(attempt);
   return {status:attempt.p_outcome,snapshotsWritten:attempt.p_observations.length};},
  now:()=>now,
 };
 return {trace,deps,attempts};
}

test("worker defaults off, suppresses a broken gate, and checks before any callback",async()=>{
 for(const gate of [undefined,()=>false,()=>{throw Error("opaque");}]){
  const {deps,trace}=fixture();
  assert.deepEqual(await runOnlineRatingLease(ids,{...deps,enabled:gate}),{status:"disabled"});
  assert.deepEqual(trace,[]);
 }
});

test("claimed but unadmitted, mismatched, expired and backfill work never reaches egress",async()=>{
 for(const change of [
  {raw:null},{raw:{...lease,jobId:randomUUID()}},{raw:{...lease,leaseUntil:new Date(now).toISOString()}},
  {raw:{...lease,provider:"fide"}},{raw:{...lease,sourceUsername:"wrong/handle"}},
  {raw:{...lease,triggerKind:"history_backfill"}},{raw:{...lease,handleRevision:Number.MAX_SAFE_INTEGER+1}},
 ]){
  const {deps,trace}=fixture();
  deps.claim=async()=>{trace.push("claim");return change.raw;};
  assert.deepEqual(await runOnlineRatingLease(ids,deps),{status:"not_admitted"});
  assert.deepEqual(trace,["claim"]);
 }
 for(const admitted of [false,() => {throw Error("opaque");}]){
  const {deps,trace}=fixture();
  deps.admit=async()=>{trace.push("admit");return typeof admitted==="function"?admitted():admitted;};
  assert.deepEqual(await runOnlineRatingLease(ids,deps),{status:admitted===false?"not_admitted":"authority_unavailable"});
  assert.deepEqual(trace,["claim","admit"]);
 }
});

test("operator off after claim or during GET leaves a lease to expire, never emits a terminal provider result",async()=>{
 for(const when of ["claim","admit","transport"]){
  const {deps,trace,attempts}=fixture();
  let active=true;
  deps.enabled=()=>active;
  const original=deps[when];
  deps[when]=async(...args)=>{const result=await original(...args);active=false;return result;};
  assert.deepEqual(await runOnlineRatingLease(ids,deps),{status:"disabled"});
  assert.deepEqual(trace,["claim","admit","transport"].slice(0,["claim","admit","transport"].indexOf(when)+1));
  assert.deepEqual(attempts,[]);
 }
});

test("one admitted observation submits only a bounded, redacted canonical payload",async()=>{
 const {deps,trace,attempts}=fixture();
 assert.deepEqual(await runOnlineRatingLease(ids,deps),{status:"finalized",outcome:"succeeded",snapshotsWritten:1});
 assert.deepEqual(trace,["claim","admit","transport","finalize"]);
 const [attempt]=attempts;
 assert.deepEqual(attempt.p_observations,[{
  time_control:"rapid",rating:1752,rating_deviation:40,provisional:false,games:18,observed_at:new Date(now).toISOString(),
 }]);
 assert.match(attempt.p_evidence_digest,/^[a-f0-9]{64}$/);
 assert.equal(attempt.p_fetched_at,new Date(now).toISOString());
 assert.equal(attempt.p_lease_token,lease.leaseToken);
 assert.equal(attempt.p_input_digest,lease.inputDigest);
 assert.equal(JSON.stringify(attempt).includes(lease.sourceUsername),false);
});

test("existing bounded provider transport classifies one attempt without re-fetching",async()=>{
 for(const [reply,outcome,code,provider] of [
  [()=>new Response(null,{status:429}),"retry","RATE_LIMITED","lichess"],
  [()=>{throw new DOMException("opaque timeout","TimeoutError");},"retry","PROVIDER_UNAVAILABLE","lichess"],
  [()=>new Response(null,{status:404}),"failed","ACCOUNT_NOT_FOUND","lichess"],
  [()=>new Response(null,{status:403}),"failed","PROVIDER_DENIED","lichess"],
  [()=>Response.json({perfs:{}}),"failed","RATING_UNAVAILABLE","lichess"],
  [()=>Response.json({}),"failed","RATING_UNAVAILABLE","chesscom"],
  [()=>new Response("{malformed"),"failed","PROVIDER_RESPONSE","lichess"],
  [()=>new Response(" ".repeat(80001)),"failed","PROVIDER_RESPONSE","chesscom"],
 ]){
  const {deps,attempts}=fixture();
  deps.claim=async()=>({...lease,provider});
  deps.admit=async()=>true;
  let requests=0;
  deps.transport=(p,username)=>fetchOnlineRatingPayload(p,username,async()=>{requests++;return reply();},{});
  assert.deepEqual(await runOnlineRatingLease(ids,deps),{status:"finalized",outcome,snapshotsWritten:0});
  assert.equal(requests,1);
  assert.equal(attempts.length,1);
  assert.deepEqual(attempts[0],{
   p_teacher_id:ids.teacherId,p_job_id:ids.jobId,p_lease_token:lease.leaseToken,p_attempt:1,p_input_digest:lease.inputDigest,
   p_outcome:outcome,p_error_code:code,p_observations:[],p_fetched_at:null,p_evidence_digest:null,
  });
 }
});

test("canonical stale and infrastructure errors do not surface private details",async()=>{
 const stale=fixture();
 stale.deps.finalize=async()=>({status:"stale",snapshotsWritten:0,privateDetail:"must not escape"});
 assert.deepEqual(await runOnlineRatingLease(ids,stale.deps),{status:"finalized",outcome:"stale",snapshotsWritten:0});
 const broken=fixture();
 broken.deps.finalize=async()=>{throw new Error("opaque server payload "+lease.sourceUsername);};
 assert.deepEqual(await runOnlineRatingLease(ids,broken.deps),{status:"finalization_unavailable"});
 const expired=fixture();
 let time=now;
 expired.deps.now=()=>time;
 expired.deps.transport=async()=>{time+=120_000;return rated;};
 assert.deepEqual(await runOnlineRatingLease(ids,expired.deps),{status:"not_admitted"});
 assert.deepEqual(expired.attempts,[]);
});
