import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {belongsToCurrentOnlineRating,readOnlineRatingFreshness} from "./online-rating-freshness";

const now=Date.parse("2026-11-26T12:00:00Z");
const hour=3_600_000;
const ago=(hours:number)=>new Date(now-hours*hour).toISOString();
const student={archived_at:null,lichess_username:" SameHandle ",chesscom_username:"OtherPlatform"};
const consentId="8a4d2607-b278-4939-a6c2-b61bfc528bad";
const consent={id:consentId,provider:"lichess",enabled:true,source_username:"SameHandle",handle_revision:3,consented_at:ago(72)};
const bound={status:"bound" as const,binding:{consentId,handle:"SameHandle",revision:3,permittedSince:now-72*hour}};
const record=(hours:number)=>({source:"provider_api",source_username:"SameHandle",source_handle_revision:3,
 time_control:"rapid",observed_at:ago(24*30),fetched_at:ago(hours)});
function fixture(cons:unknown,observed:unknown,errorTable?:string,job:unknown=null){
 const calls:Array<[string,string,...unknown[]]>=[];
 const db={from(table:string){
  const response=()=>({data:table==="student_rating_sync_consents"?cons:table==="student_rating_refresh_jobs"?job:observed,error:table===errorTable});
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
    {provider:"lichess",status:expected,lastObservation:{observedAt:ago(24*30),fetchedAt:ago(age),timeControl:"rapid"},latestRefresh:{status:"none"}},
    {provider:"chesscom",status:"permission_off",lastObservation:null,latestRefresh:null},
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
    {provider:"lichess",status,lastObservation:null,latestRefresh:status==="no_observation"?{status:"none"}:null});
  }
  for(const item of [
   fixture([consent],record(-1)),fixture([consent],{...record(1),source_handle_revision:4}),
   fixture([consent],record(1),"student_rating_snapshots"),
   fixture([consent,consent],record(1)),fixture([consent],record(1),"student_rating_sync_consents"),
  ]){
   expect((await readOnlineRatingFreshness(item.db,"t","s",student,now)).providers[0]).toEqual(
    {provider:"lichess",status:"unavailable",lastObservation:null,latestRefresh:item.calls.some(([table])=>table==="student_rating_refresh_jobs")?{status:"none"}:null});
  }
  const revoked=fixture([{...consent,enabled:false}],record(1));
  expect((await readOnlineRatingFreshness(revoked.db,"t","s",student,now)).providers[0]?.status).toBe("permission_off");
  expect(revoked.calls.some(([table])=>table==="student_rating_snapshots")).toBe(false);
 });
 it("separates current queue state from ratings and redacts internal job diagnostics",async()=>{
  const base={consent_id:consentId,source_username:"SameHandle",handle_revision:3,trigger_kind:"scheduled",
   created_at:ago(12),updated_at:ago(1),finished_at:null,lease_until:null,last_error_code:null};
  const cases=[
   [{status:"pending"},"queued",null],
   [{status:"running",lease_until:ago(-1)},"in_progress",null],
   [{status:"running",lease_until:ago(0)},"interrupted",null],
   [{status:"retry",last_error_code:"RATE_LIMITED"},"retry_wait","rate_limited"],
   [{status:"succeeded",finished_at:ago(1)},"succeeded",null],
   [{status:"stale",finished_at:ago(1)},"superseded",null],
   [{status:"cancelled",finished_at:ago(1)},"cancelled",null],
   [{status:"failed",finished_at:ago(1),last_error_code:"INTERNAL_DIAGNOSTIC"},"failed","other"],
  ] as const;
  for(const [row,status,reason] of cases){
   const f=fixture([consent],record(60),undefined,{...base,...row});
   const r=(await readOnlineRatingFreshness(f.db,"teacher","student",student,now)).providers[0];
   expect(r).toMatchObject({status:"stale",lastObservation:{fetchedAt:ago(60)},
    latestRefresh:{status,reason,queuedAt:ago(12),updatedAt:ago(1)}});
   expect(JSON.stringify(r)).not.toMatch(/INTERNAL_DIAGNOSTIC|SameHandle|8a4d2607/);
   const table="student_rating_refresh_jobs";
   for(const [name,value] of Object.entries({teacher_id:"teacher",student_id:"student",provider:"lichess",
    consent_id:consentId,source_username:"SameHandle",handle_revision:3}))expect(f.calls).toContainEqual([table,"eq",name,value]);
   expect(f.calls).toContainEqual([table,"in","trigger_kind",["profile_save","manual","scheduled"]]);
   expect(f.calls).toContainEqual([table,"gte","created_at",ago(72)]);
   expect(f.calls).toContainEqual([table,"order","id",{ascending:false}]);
   expect(f.calls).toContainEqual([table,"limit",1]);
  }
  for(const row of [
   {...base,trigger_kind:"history_backfill"},
   {...base,source_username:"samehandle"},
   {...base,handle_revision:2},
   {...base,consent_id:"ff5b4c79-aa6e-4793-8f1a-86e356fd9556"},
   {...base,created_at:ago(73)},
  ]){
   const f=fixture([consent],record(60),undefined,{status:"pending",...row});
   const r=(await readOnlineRatingFreshness(f.db,"teacher","student",student,now)).providers[0];
   expect(r).toMatchObject({status:"stale",latestRefresh:{status:"unavailable"}});
  }
  const denied=fixture([consent],record(60),"student_rating_refresh_jobs");
  expect((await readOnlineRatingFreshness(denied.db,"teacher","student",student,now)).providers[0])
   .toMatchObject({status:"stale",latestRefresh:{status:"unavailable"}});
 });
});
