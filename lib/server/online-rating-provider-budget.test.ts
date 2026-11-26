import {describe,expect,it,vi} from "vitest";
import {onlineRatingProviderBudget,runOnlineRatingCandidateWithBudget} from "./online-rating-provider-budget";
import {OnlineRatingProviderLimited} from "./online-rating-transport";
import type {SupabaseClient} from "@supabase/supabase-js";

const id=(n:number)=>"40000000-0000-4000-8000-"+String(n).padStart(12,"0");
const t=Date.parse("2026-06-03T00:00:00.000Z");
const iso=(d:number)=>new Date(t+d).toISOString();
const query={teacherId:id(1),jobId:id(2),provider:"lichess"};
const rawJob={...query,studentId:id(4),sourceUsername:"Fixture123",
 handleRevision:1,inputDigest:"a".repeat(64),triggerKind:"scheduled",attempt:1,
 leaseToken:id(5),leaseUntil:iso(70_000)};
const rawBudget={status:"admitted",token:id(3),leaseUntil:iso(90_000)};
const complete={p_outcome:"completed",p_retry_at:null};

function fixture(){
 const order:string[]=[];
 const deps={
  now:()=>t,enabled:vi.fn(()=>true),
  budget:{
   acquire:vi.fn(async()=>{order.push("acquire");return rawBudget as unknown;}),
   finish:vi.fn(async()=>{order.push("finish");return {status:"recorded"} as unknown;}),
  },
  claim:vi.fn(async()=>{order.push("claim");return rawJob as unknown;}),
  admit:vi.fn(async()=>{order.push("admit");return true;}),
  transport:vi.fn(async()=>{order.push("transport");return {perfs:{rapid:{rating:1700,games:9}}};}),
  finalize:vi.fn(async()=>{order.push("finalize");return {status:"succeeded",snapshotsWritten:1};}),
 };
 return {order,deps};
}
describe("shared provider budget in the unregistered worker",()=>{
 it("reserves before claim, verifies fresh admission, and settles before finalization",async()=>{
  const {deps,order}=fixture();
  expect(await runOnlineRatingCandidateWithBudget(query,deps)).toEqual({status:"finalized",outcome:"succeeded",snapshotsWritten:1});
  expect(order).toEqual(["acquire","claim","admit","transport","finish","finalize"]);
  expect(deps.budget.finish).toHaveBeenCalledExactlyOnceWith("lichess",id(3),complete);
 });
 it("does not claim on quota, contention, pause or unknown grant",async()=>{
  for(const status of ["paused","quota","busy","cooling_down","operator_hold","in_flight","unavailable","unexpected"]){
   const {deps,order}=fixture();
   deps.budget.acquire.mockResolvedValueOnce({status});
   expect(await runOnlineRatingCandidateWithBudget(query,deps)).toEqual({status:status==="unexpected"?"authority_unavailable":"budget_withheld"});
   expect(order).toEqual([]);
  }
 });
 it("settles exactly once on disabled after reserve, stale claim, provider mismatch, denied fresh admission, or expiring grant",async()=>{
  for(const kind of ["pause","stale","other","denied","expiry"]){
   const {deps}=fixture();
   if(kind==="pause")deps.enabled.mockReturnValueOnce(true).mockReturnValue(false);
   if(kind==="stale")deps.claim.mockResolvedValueOnce(null);
   if(kind==="other")deps.claim.mockResolvedValueOnce({...rawJob,provider:"chesscom"});
   if(kind==="denied")deps.admit.mockResolvedValueOnce(false);
   if(kind==="expiry")deps.budget.acquire.mockResolvedValueOnce({...rawBudget,leaseUntil:iso(9000)});
   expect(await runOnlineRatingCandidateWithBudget(query,deps)).toEqual({status:kind==="pause"?"disabled":"not_admitted"});
   expect(deps.transport).not.toHaveBeenCalled();
   expect(deps.finalize).not.toHaveBeenCalled();
   expect(deps.budget.finish).toHaveBeenCalledExactlyOnceWith("lichess",id(3),complete);
  }
 });
 it("keeps longer cooldown and operator hold before finalizing the sanitized retry",async()=>{
  for(const hint of [{kind:"until",retryAt:t+193_000},{kind:"operator_hold"}] as const){
   const {deps,order}=fixture();
   deps.transport.mockRejectedValueOnce(new OnlineRatingProviderLimited(hint));
   deps.budget.finish.mockImplementationOnce(async()=>{order.push("finish");return {status:hint.kind==="until"?"recorded":"operator_hold"};});
   await runOnlineRatingCandidateWithBudget(query,deps);
   expect(deps.budget.finish).toHaveBeenCalledExactlyOnceWith("lichess",id(3),
    hint.kind==="until"?{p_outcome:"rate_limited",p_retry_at:iso(193_000)}:{p_outcome:"operator_hold",p_retry_at:null});
   expect(deps.finalize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({p_outcome:"retry",p_error_code:"RATE_LIMITED"}));
   expect(order.indexOf("finish")).toBeLessThan(order.indexOf("finalize"));
  }
 });
 it("does not finalize when exact settlement cannot be confirmed, and never retries the provider",async()=>{
  for(const status of ["stale","busy","invalid","bad"]){
   const {deps}=fixture();
   deps.budget.finish.mockResolvedValueOnce({status});
   expect(await runOnlineRatingCandidateWithBudget(query,deps)).toEqual({status:"authority_unavailable"});
   expect(deps.transport).toHaveBeenCalledTimes(1);
   expect(deps.finalize).not.toHaveBeenCalled();
   expect(deps.budget.finish).toHaveBeenCalledTimes(1);
  }
 });
 it("holds a provider after an unexpected transport error without exposing that error",async()=>{
  const {deps}=fixture();
  deps.transport.mockRejectedValueOnce(new Error("private response"));
  deps.budget.finish.mockResolvedValueOnce({status:"operator_hold"});
  await runOnlineRatingCandidateWithBudget(query,deps);
  expect(deps.budget.finish).toHaveBeenCalledExactlyOnceWith("lichess",id(3),{p_outcome:"operator_hold",p_retry_at:null});
  expect(deps.finalize).toHaveBeenCalledWith(expect.objectContaining({p_error_code:"PROVIDER_UNAVAILABLE"}));
 });
 it("submits only exact budget RPC fields and redacts database errors",async()=>{
  const rpc=vi.fn().mockResolvedValueOnce({data:rawBudget,error:null}).mockResolvedValueOnce({data:null,error:"private database error"});
  const budget=onlineRatingProviderBudget({rpc} as unknown as SupabaseClient);
  await expect(budget.acquire("lichess")).resolves.toEqual(rawBudget);
  await expect(budget.finish("lichess",id(3),{p_outcome:"completed",p_retry_at:null})).rejects.toThrow("Online rating provider budget unavailable");
  expect(rpc.mock.calls).toEqual([
   ["ccp_online_rating_budget_acquire",{p_provider:"lichess"}],
   ["ccp_online_rating_budget_finish",{p_provider:"lichess",p_token:id(3),...complete}],
  ]);
 });
});
