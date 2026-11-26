import {beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {runOnlineRatingBatch} from "./online-rating-batch";
import {runOnlineRatingOperatorPass} from "./online-rating-operator-pass";

vi.mock("./online-rating-batch",()=>({runOnlineRatingBatch:vi.fn()}));
const batch=vi.mocked(runOnlineRatingBatch);
const input={provider:"lichess",confirmed:true,enqueue:1,work:2} as const;
const deps={db:{} as SupabaseClient,transport:vi.fn()};
const result={
 status:"ran",checked:1,queued:1,scanned:1,submitted:1,finalized:1,withheld:0,unavailable:0,
} as const;

describe("trusted operator in-process rating pass",()=>{
 beforeEach(()=>{vi.resetAllMocks();batch.mockResolvedValue(result);});
 it.each([
  {...input,confirmed:false},{...input,provider:"fide"},{...input,work:3},
  {...input,enqueue:9},{...input,enqueue:0,work:0},{...input,force:true},
 ])("refuses invalid or broadened input: %j",async candidate=>{
  const isAllowed=vi.fn(()=>true);
  expect(await runOnlineRatingOperatorPass(candidate,{...deps,isAllowed})).toEqual({status:"invalid"});
  expect(isAllowed).not.toHaveBeenCalled();
  expect(batch).not.toHaveBeenCalled();
 });
 it("is disabled by default and fails closed if the capability fails",async()=>{
  expect(await runOnlineRatingOperatorPass(input,deps)).toEqual({status:"disabled"});
  expect(await runOnlineRatingOperatorPass(input,{...deps,isAllowed:()=>false})).toEqual({status:"disabled"});
  expect(await runOnlineRatingOperatorPass(input,{...deps,isAllowed:()=>{throw Error("private");}})).toEqual({status:"disabled"});
  expect(batch).not.toHaveBeenCalled();
  expect(deps.transport).not.toHaveBeenCalled();
 });
 it.each(["lichess","chesscom"] as const)("limits a signed-off invocation to %s and rechecks revocation",async provider=>{
  let active=true;
  const isAllowed=vi.fn(scope=>Object.isFrozen(scope)&&scope.provider===provider&&scope.work===2&&active);
  const requested={...input,provider};
  batch.mockImplementationOnce(async(limits,forwarded)=>{
   expect(limits).toEqual({
    [provider]:{enqueue:1,work:2},[provider==="lichess"?"chesscom":"lichess"]:{enqueue:0,work:0},
   });
   expect(forwarded.db).toBe(deps.db);
   expect(forwarded.transport).toBe(deps.transport);
   expect(forwarded.providerEnabled?.(provider==="lichess"?"chesscom":"lichess")).toBe(false);
   expect(forwarded.enabled?.()).toBe(true);
   expect(forwarded.providerEnabled?.(provider)).toBe(true);
   active=false;
   expect(forwarded.enabled?.()).toBe(false);
   expect(forwarded.providerEnabled?.(provider)).toBe(false);
   return result;
  });
  expect(await runOnlineRatingOperatorPass(requested,{...deps,isAllowed})).toEqual(result);
  expect(isAllowed.mock.calls.map(([scope])=>scope)).toEqual(Array(5).fill(requested));
  expect(batch).toHaveBeenCalledTimes(1);
 });
});
