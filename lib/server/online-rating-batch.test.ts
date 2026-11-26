import {beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {runOnlineRatingBatch} from "./online-rating-batch";

const mocks=vi.hoisted(()=>({
 discover:vi.fn(),attempt:vi.fn(),budget:{acquire:vi.fn(),finish:vi.fn()},
 authority:{claim:vi.fn(),admit:vi.fn(),finalize:vi.fn()},
}));
vi.mock("./online-rating-queue",()=>({onlineRatingQueueDiscovery:()=>mocks.discover}));
vi.mock("./online-rating-worker-authority",()=>({onlineRatingWorkerAuthority:()=>mocks.authority}));
vi.mock("./online-rating-provider-budget",()=>({
 onlineRatingProviderBudget:()=>mocks.budget,runOnlineRatingCandidateWithBudget:mocks.attempt,
}));
const id=(n:number)=>"40000000-0000-4000-8000-"+String(n).padStart(12,"0");
const row=(n:number,provider="lichess")=>({teacherId:id(1),jobId:id(n),provider});
const all={lichess:{enqueue:8,work:2},chesscom:{enqueue:8,work:2}};
const lichess={...all,chesscom:{enqueue:0,work:0}};
const successful={status:"ok",checked:8,queued:2};
const receipt={status:"finalized",outcome:"succeeded",snapshotsWritten:1};
function fixture(){
 const rpc=vi.fn().mockResolvedValue({data:successful,error:null});
 const transport=vi.fn();
 let active=true,forLichess=true;
 return {rpc,transport,pause:()=>{active=false;},pauseLichess:()=>{forLichess=false;},
  deps:{db:{rpc} as unknown as SupabaseClient,transport,enabled:()=>active,
   providerEnabled:(key:string)=>key!=="lichess"||forLichess}};
}

describe("one bounded unregistered ratings pass",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();
  mocks.discover.mockResolvedValue([]);
  mocks.attempt.mockResolvedValue(receipt);
 });
 it("does not talk to the database without both explicit gates and rejects unsafe limits",async()=>{
  const f=fixture();
  expect((await runOnlineRatingBatch(all,{...f.deps,enabled:undefined})).status).toBe("disabled");
  expect((await runOnlineRatingBatch(all,{...f.deps,enabled:()=>{throw new Error("internal");}})).status).toBe("disabled");
  expect((await runOnlineRatingBatch(all,{...f.deps,providerEnabled:undefined})).status).toBe("ran");
  expect((await runOnlineRatingBatch({...all,lichess:{enqueue:9,work:2}},f.deps)).status).toBe("invalid");
  expect((await runOnlineRatingBatch({...all,lichess:{enqueue:8,work:3}},f.deps)).status).toBe("invalid");
  expect(f.rpc).not.toHaveBeenCalled();
  expect(mocks.discover).not.toHaveBeenCalled();
  expect(mocks.attempt).not.toHaveBeenCalled();
 });
 it("reenforces pause after enqueue, discovery, and inside the budgeted worker",async()=>{
  const f=fixture();
  f.rpc.mockImplementationOnce(async()=>{f.pause();return {data:successful,error:null};});
  expect(await runOnlineRatingBatch(all,f.deps)).toMatchObject({status:"disabled",queued:2,submitted:0});
  expect(f.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.discover).not.toHaveBeenCalled();
  const g=fixture();
  mocks.discover.mockImplementationOnce(async()=>{g.pause();return [row(2)];});
  expect(await runOnlineRatingBatch(all,g.deps)).toMatchObject({status:"disabled",submitted:0});
  expect(mocks.attempt).not.toHaveBeenCalled();
  const h=fixture();
  mocks.discover.mockResolvedValueOnce([row(2),row(3)]).mockResolvedValueOnce([row(4,"chesscom")]);
  mocks.attempt.mockImplementationOnce(async(_,deps)=>{
   expect(deps.enabled()).toBe(true);
   expect(deps.budget).toBe(mocks.budget);
   expect(deps.claim).toBe(mocks.authority.claim);
   expect(deps.transport).toBe(h.transport);
   h.pauseLichess();
   expect(deps.enabled()).toBe(false);
   return {status:"disabled"};
  });
  expect(await runOnlineRatingBatch(all,h.deps)).toMatchObject({status:"ran",submitted:2,finalized:1});
  expect(mocks.attempt.mock.calls.map(([c])=>c)).toEqual([row(2),row(4,"chesscom")]);
 });
 it.each(["budget_withheld","authority_unavailable","finalization_unavailable","throws","retry"])(
  "stops this provider on %s but proceeds independently with the other provider",async status=>{
   const f=fixture();
   mocks.discover.mockResolvedValueOnce([row(2),row(3)]).mockResolvedValueOnce([row(4,"chesscom")]);
   if(status==="throws")mocks.attempt.mockRejectedValueOnce(new Error("private owner or token"));
   else mocks.attempt.mockResolvedValueOnce(status==="retry"?{...receipt,outcome:"retry"}:{status});
   const observed=await runOnlineRatingBatch(all,f.deps);
   expect(f.rpc.mock.calls).toEqual([
    ["ccp_online_rating_enqueue_due",{p_provider:"lichess",p_limit:8}],
    ["ccp_online_rating_enqueue_due",{p_provider:"chesscom",p_limit:8}],
   ]);
   expect(mocks.discover.mock.calls).toEqual([["lichess",2],["chesscom",2]]);
   expect(mocks.attempt.mock.calls.map(([c])=>c)).toEqual([row(2),row(4,"chesscom")]);
   expect(observed).toEqual({status:"ran",checked:16,queued:4,scanned:3,submitted:2,
    finalized:status==="retry"?2:1,withheld:status==="budget_withheld"?1:0,
    unavailable:["retry","budget_withheld"].includes(status)?0:1});
  });
 it("never reaches a worker after a malformed, unavailable, busy, or paused enqueue",async()=>{
  for(const data of [{...successful,queued:9},{...successful,checked:33},{...successful,checked:1},
   {...successful,debug:"private"},null,{status:"busy"},{status:"paused"},{status:"invalid"}]){
   const f=fixture();
   f.rpc.mockResolvedValueOnce({data,error:null});
   const result=await runOnlineRatingBatch(lichess,f.deps);
   const paused=data?.status==="paused";
   expect(result).toEqual({status:"ran",checked:0,queued:0,scanned:0,submitted:0,finalized:0,
    withheld:paused?1:0,unavailable:paused?0:1});
  }
  expect(mocks.discover).not.toHaveBeenCalled();
  expect(mocks.attempt).not.toHaveBeenCalled();
 });
 it("de-duplicates candidates and rejects cross-provider and oversized discovery",async()=>{
  const f=fixture();
  mocks.discover.mockResolvedValueOnce([row(2),row(2)]).mockResolvedValueOnce([row(3)]);
  expect(await runOnlineRatingBatch(all,f.deps)).toMatchObject({submitted:1,finalized:1,unavailable:1});
  mocks.discover.mockResolvedValueOnce([row(2),row(3),row(4)]);
  expect(await runOnlineRatingBatch(lichess,f.deps)).toMatchObject({submitted:0,unavailable:1});
  expect(mocks.attempt).toHaveBeenCalledTimes(1);
 });
});
