import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {onlineRatingQueueDiscovery} from "./online-rating-queue";

const teacherId="40000000-0000-4000-8000-000000000001";
const candidate=(n:number)=>({teacherId,jobId:"40000000-0000-4000-8000-"+String(n).padStart(12,"0"),provider:"lichess" as const});
const row=(n:number)=>({id:candidate(n).jobId,teacher_id:teacherId});
const instant=Date.parse("2026-01-02T00:00:00.000Z");

function fakeQueue(pending:unknown,expired:unknown){
 const log:Array<Array<unknown>>=[];
 const select=(fields:string)=>{
  const branch:unknown[]=[fields];log.push(branch);
  const builder={
   eq:(...args:unknown[])=>{branch.push(["eq",...args]);return builder;},
   in:(...args:unknown[])=>{branch.push(["in",...args]);return builder;},
   lte:(...args:unknown[])=>{branch.push(["lte",...args]);return builder;},
   order:(...args:unknown[])=>{branch.push(["order",...args]);return builder;},
   limit:(...args:unknown[])=>{
    branch.push(["limit",...args]);
    return Promise.resolve({error:null,data:fields.endsWith("run_after")?pending:expired});
   },
  };
  return builder;
 };
 return {db:{from:()=>({select})} as unknown as SupabaseClient,log};
}
describe("online rating discovery and bounded operation",()=>{
 it("separately reads due and expired candidates, drops future and duplicate IDs, and forbids backfill",async()=>{
  const f=fakeQueue([{...row(1),run_after:"2026-01-01T12:00:00+00:00"},{...row(2),run_after:"2026-01-03T12:00:00Z"}],
   [{...row(3),lease_until:"2026-01-01T10:00:00Z"},{...row(1),lease_until:"2026-01-01T13:00:00Z"}]);
  await expect(onlineRatingQueueDiscovery(f.db,()=>instant)("lichess",2)).resolves.toEqual([candidate(3),candidate(1)]);
  expect(f.log).toHaveLength(2);
  for(const calls of f.log){
   expect(calls).toContainEqual(["eq","provider","lichess"]);
   expect(calls).toContainEqual(["in","trigger_kind",["profile_save","manual","scheduled"]]);
   expect(calls).toContainEqual(["limit",2]);
  }
  expect(f.log[0]).toContainEqual(["in","status",["pending","retry"]]);
  expect(f.log[1]).toContainEqual(["eq","status","running"]);
  expect(f.log[0]).toContainEqual(["lte","run_after","2026-01-02T00:00:00.000Z"]);
  expect(f.log[1]).toContainEqual(["lte","lease_until","2026-01-02T00:00:00.000Z"]);
 });
 it("fails closed on invalid database candidates and invalid bounds",async()=>{
  const f=fakeQueue([{...row(1),run_after:"unknown"}],[]);
  await expect(onlineRatingQueueDiscovery(f.db,()=>instant)("lichess",2)).rejects.toThrow();
  f.log.length=0;
  await expect(onlineRatingQueueDiscovery(f.db,()=>instant)("lichess",99)).rejects.toThrow();
  expect(f.log).toHaveLength(0);
 });
});
