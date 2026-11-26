import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {belongsToCurrentOnlineRating,readOnlineRatingFreshness} from "./online-rating-freshness";

const now=Date.parse("2026-11-26T12:00:00Z");
const hour=3_600_000;
const ago=(hours:number)=>new Date(now-hours*hour).toISOString();
const student={archived_at:null,lichess_username:" SameHandle ",chesscom_username:"OtherPlatform"};
const consent={provider:"lichess",enabled:true,source_username:"SameHandle",handle_revision:3,consented_at:ago(72)};
const bound={status:"bound" as const,binding:{handle:"SameHandle",revision:3,permittedSince:now-72*hour}};
const record=(hours:number)=>({source:"provider_api",source_username:"SameHandle",source_handle_revision:3,
 time_control:"rapid",observed_at:ago(24*30),fetched_at:ago(hours)});
function fixture(cons:unknown,observed:unknown,errorTable?:string){
 const calls:Array<[string,string,...unknown[]]>=[];
 const db={from(table:string){
  const response=()=>({data:table==="student_rating_sync_consents"?cons:observed,error:table===errorTable});
  const chain={
   ...Object.fromEntries(["select","eq","in","gte","order","limit"].map(method=>
    [method,(...args:unknown[])=>{calls.push([table,method,...args]);return chain;}])),
   then:(done:(reply:unknown)=>void)=>Promise.resolve(response()).then(done),
   maybeSingle:()=>Promise.resolve(response()),
  };
  return chain;
 }} as unknown as SupabaseClient;
 return {db,calls};
}

describe("read-only freshness for the exact currently authorized public rating binding",()=>{
 it("defines freshness from fetch age, not when a game was played; scopes each DB read",async()=>{
  for(const [age,expected] of [[47,"recent"],[48,"stale"],[65,"stale"]] as const){
   const f=fixture([consent],record(age));
   const r=await readOnlineRatingFreshness(f.db,"teacher","student",student,now);
   expect(r.providers).toEqual([
    {provider:"lichess",status:expected,lastObservation:{observedAt:ago(24*30),fetchedAt:ago(age),timeControl:"rapid"}},
    {provider:"chesscom",status:"permission_off",lastObservation:null},
   ]);
   expect(JSON.stringify(r.providers)).not.toContain("SameHandle");
   for(const table of ["student_rating_sync_consents","student_rating_snapshots"]){
    expect(f.calls).toContainEqual([table,"eq","teacher_id","teacher"]);
    expect(f.calls).toContainEqual([table,"eq","student_id","student"]);
   }
   expect(f.calls).toContainEqual(["student_rating_snapshots","eq","source_handle_revision",3]);
   expect(f.calls).toContainEqual(["student_rating_snapshots","eq","source_username","SameHandle"]);
   expect(f.calls).toContainEqual(["student_rating_snapshots","gte","fetched_at",ago(72)]);
   expect(f.calls).toContainEqual(["student_rating_snapshots","limit",1]);
  }
 });
 it("does not upgrade historical, unbound, old-revision or mismatched-case rows",()=>{
  const valid=record(60);
  expect(belongsToCurrentOnlineRating(bound,valid,now)).toBe(true);
  for(const row of [{...valid,source:"teacher_manual"},{...valid,source_handle_revision:2},
   {...valid,source_handle_revision:null},{...valid,source_username:"samehandle"},
   {...valid,fetched_at:ago(73)},{...valid,fetched_at:ago(-1)},
   {...valid,fetched_at:null},{...valid,observed_at:ago(5)}]){
   expect(belongsToCurrentOnlineRating(bound,row,now)).toBe(false);
  }
  expect(belongsToCurrentOnlineRating({status:"permission_off"},valid,now)).toBe(false);
 });
 it("reports inactive and unknown states without claiming provider activity",async()=>{
  const f=fixture([consent],null);
  for(const [input,status] of [
   [{...student,archived_at:ago(1)},"archived"],
   [{...student,lichess_username:null},"not_linked"],
   [student,"no_observation"],
  ] as const){
   expect((await readOnlineRatingFreshness(f.db,"teacher","student",input,now)).providers[0]).toEqual(
    {provider:"lichess",status,lastObservation:null});
  }
  for(const item of [
   fixture([consent],record(-1)),fixture([consent],{...record(1),source_handle_revision:4}),
   fixture([consent],record(1),"student_rating_snapshots"),
   fixture([consent,consent],record(1)),fixture([consent],record(1),"student_rating_sync_consents"),
  ]){
   expect((await readOnlineRatingFreshness(item.db,"t","s",student,now)).providers[0]).toEqual(
    {provider:"lichess",status:"unavailable",lastObservation:null});
  }
  const revoked=fixture([{...consent,enabled:false}],record(1));
  expect((await readOnlineRatingFreshness(revoked.db,"t","s",student,now)).providers[0]?.status).toBe("permission_off");
  expect(revoked.calls.some(([table])=>table==="student_rating_snapshots")).toBe(false);
 });
});
