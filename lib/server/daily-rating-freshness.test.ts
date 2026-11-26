import type {SupabaseClient} from "@supabase/supabase-js";
import {describe,expect,it} from "vitest";
import {teacherDailyRatingFreshness} from "./daily-rating-freshness";

const now=new Date("2026-11-26T14:00:00.000Z");
const at=(age:number)=>new Date(now.getTime()-age*3_600_000).toISOString();
const uuid=(n:number)=>"12345678-aaaa-4aaa-8aaa-"+String(n).padStart(12,"0");
const account=(n:number)=>({id:uuid(n),student_id:uuid(100+n),source_username:"Player_"+n,
 handle_revision:3,consented_at:at(90),learner:{lichess_username:"Player_"+n,chesscom_username:null}});
const obs=(n:number,age:number)=>({student_id:uuid(100+n),source:"provider_api",source_username:"Player_"+n,
 source_handle_revision:3,fetched_at:at(age),observed_at:at(age+150)});
function mock(before:unknown[],observations:unknown[],after=before,error=false){
 let reads=0;const calls:Array<[string,string,...unknown[]]>=[];
 const db={from(table:string){
  let key="";const chain={
   ...Object.fromEntries(["select","eq","is","order","limit","or","lte"].map(method=>[method,(...args:unknown[])=>{
    calls.push([table,method,...args]);if(method==="eq"&&args[0]==="provider")key=String(args[1]);return chain;
   }])),
   then(resolve:(x:unknown)=>unknown){return Promise.resolve({
    data:key==="chesscom"?[]:table==="student_rating_sync_consents"?(++reads===1?before:after):observations,
    error:table==="student_rating_snapshots"&&error,
   }).then(resolve);},
  };return chain;
 }} as unknown as SupabaseClient;
 return {db,calls};
}
describe("bounded daily rating freshness review",()=>{
 it("uses exact current binding, fetch age, scope, and counts, not old observation dates",async()=>{
  const f=mock([account(1),account(2),account(3)],[obs(1,47),obs(2,48)]);
  const r=await teacherDailyRatingFreshness(f.db,"teacher",null,now);
  expect(r).toEqual({status:"ready",providers:[
   {provider:"lichess",status:"ready",counts:{recent:1,stale:1,no_observation:1,unknown:0},partial:false},
   {provider:"chesscom",status:"ready",counts:{recent:0,stale:0,no_observation:0,unknown:0},partial:false},
  ]});
  expect(JSON.stringify(r)).not.toMatch(/Player_|12345678/);
  expect(f.calls.filter(x=>x[1]==="select")).toHaveLength(4);
  expect(f.calls.filter(x=>x[1]==="eq"&&x[2]==="teacher_id").every(x=>x[3]==="teacher")).toBe(true);
  expect(f.calls).toContainEqual(["student_rating_sync_consents","is","learner.archived_at",null]);
  expect(f.calls).toContainEqual(["student_rating_sync_consents","is","revoked_at",null]);
  expect(f.calls).toContainEqual(["student_rating_snapshots","lte","fetched_at",now.toISOString()]);
  const predicate=String(f.calls.find(x=>x[1]==="or")?.[2]);
  expect(predicate).toContain("student_id.eq."+account(1).student_id+",source_handle_revision.eq.3,source_username.eq.Player_1,fetched_at.gte."+at(90));
 });
 it("does not count a missing result after truncation or a changed binding as no observation",async()=>{
  const f=mock(Array.from({length:13},(_,i)=>account(i+1)),Array.from({length:97},()=>obs(1,12)),
   Array.from({length:13},(_,i)=>({...account(i+1),handle_revision:i===0?4:3})));
  expect(await teacherDailyRatingFreshness(f.db,"teacher",null,now)).toMatchObject({
   providers:[{status:"ready",counts:{recent:0,stale:0,no_observation:0,unknown:12},partial:true},{}],
  });
 });
 it("honors workplace gate and reports unavailable instead of manufacturing zeroes",async()=>{
  const f=mock([account(1)],[],undefined,true);
  expect(await teacherDailyRatingFreshness(f.db,"teacher",uuid(7),now))
   .toEqual({status:"workplace_scope_unavailable"});
  expect(f.calls).toHaveLength(0);
  expect(await teacherDailyRatingFreshness(f.db,"teacher",null,now)).toMatchObject({
   providers:[{provider:"lichess",status:"unavailable"},{provider:"chesscom",status:"ready"}],
  });
 });
});
