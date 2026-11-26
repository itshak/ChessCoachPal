import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY: dashboard current rating freshness preserves consent, saved history and scope",async({page,request})=>{
 test.setTimeout(120_000);
 const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
 expect(url.protocol).toBe("http:");
 expect(url.hostname).toBe("127.0.0.1");
 const admin=createClient(url.origin,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const identities:string[]=[];
 const password="DailySavedRatingsFixture123!";
 const hoursAgo=(n:number)=>new Date(Date.now()-n*3_600_000).toISOString();
 const today=hoursAgo(0).slice(0,10),yesterday=hoursAgo(24).slice(0,10);
 async function row(table:string,value:Record<string,unknown>){
  const result=await admin.from(table).insert(value).select("id").single();
  expect(result.error,table).toBeNull();
  return result.data!.id as string;
 }
 async function tenant(){
  const email="saved-ratings-"+randomUUID()+"@example.invalid";
  const auth=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(auth.error).toBeNull();
  const id=auth.data.user!.id;
  identities.push(id);
  expect((await admin.from("teachers").insert({id,email,display_name:"Saved ratings fixture",
   preferred_locale:"en",onboarding_tour_completed_at:hoursAgo(1)})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,20,2);
  expect((await admin.from("teacher_settings").upsert({teacher_id:id,timezone:"UTC"})).error).toBeNull();
  return {id,email};
 }
 type Provider="lichess"|"chesscom";
 async function binding(teacher_id:string,provider:Provider,label:string,mode:"active"|"archived"|"off"="active"){
  const username="SavedTest_"+label;
  const student_id=await row("students",{teacher_id,name:"Private Learner "+label,
   [provider==="lichess"?"lichess_username":"chesscom_username"]:username,
   ...(mode==="archived"?{archived_at:hoursAgo(3)}:{})});
  const consent=await row("student_rating_sync_consents",{teacher_id,student_id,provider,
   source_username:username,enabled:mode!=="off",consented_at:hoursAgo(96),handle_revision:3,
   ...(mode==="off"?{revoked_at:hoursAgo(2)}:{})});
  return {teacher_id,student_id,provider,username,consent};
 }
 async function observe(b:Awaited<ReturnType<typeof binding>>,age:number,rev=3){
  const {teacher_id,student_id,provider,username}=b;
  return row("student_rating_snapshots",{teacher_id,student_id,provider,time_control:"rapid",rating:1421,
   source:"provider_api",source_username:username,source_handle_revision:rev,observed_at:hoursAgo(age+24*7),
   fetched_at:hoursAgo(age),request_id:randomUUID(),preview_digest:"a".repeat(64)});
 }
 try{
  const owner=await tenant(),foreign=await tenant();
  const venue=await row("workplaces",{teacher_id:owner.id,name:"Synthetic School",timezone:"UTC",
   locale:"en",currency:"USD",kind:"professional",policy:{}});
  const current=await binding(owner.id,"lichess","recent");
  const stale=await binding(owner.id,"lichess","stale");
  const newBinding=await binding(owner.id,"lichess","no_evidence");
  const revoked=await binding(owner.id,"lichess","revoked","off");
  const archived=await binding(owner.id,"lichess","archived","archived");
  const otherProvider=await binding(owner.id,"chesscom","stale_other");
  const foreignBinding=await binding(foreign.id,"lichess","foreign");
  await observe(current,10);
  await observe(stale,60);
  await observe(stale,2,2);
  await observe(newBinding,1,2);
  await observe(revoked,1);
  await observe(archived,1);
  await observe(otherProvider,60);
  await observe(foreignBinding,1);
  const snapshot=async()=>{
   const result=await Promise.all([
    admin.from("student_rating_sync_consents").select("id,enabled,handle_revision").eq("teacher_id",owner.id).order("id"),
    admin.from("student_rating_snapshots").select("id,rating,source_handle_revision").eq("teacher_id",owner.id).order("id"),
    admin.from("student_rating_refresh_jobs").select("id,status").eq("teacher_id",owner.id).order("id"),
    admin.from("student_rating_refresh_receipts").select("id,outcome").eq("teacher_id",owner.id).order("id"),
   ]);
   expect(result.map(r=>r.error)).toEqual([null,null,null,null]);
   return result.map(r=>r.data);
  };
  const before=await snapshot();
  const call=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
  async function read(date:string,ratingFreshness?:true){
   const response=await page.request.get("/api/dashboard/summary?date="+date+(ratingFreshness?"&ratingFreshness=1":""));
   expect(response.status(),await response.text()).toBe(200);
   const body=await response.json();
   const paired=await call("ccp_dashboard_summary",{date,...(ratingFreshness?{ratingFreshness}:{})});
   expect(paired.error).toBeUndefined();
   expect(paired.data).toEqual(body);
   return body.daily;
  }
  const plain=await read(today);
  expect(plain.ratingFreshness).toBeUndefined();
  const daily=await read(today,true);
  expect(daily.ratingReview).toEqual(plain.ratingReview);
  expect(daily.ratingFreshness).toEqual({status:"ready",providers:[
   {provider:"lichess",status:"ready",counts:{recent:1,stale:1,no_observation:1,unknown:0},partial:false},
   {provider:"chesscom",status:"ready",counts:{recent:0,stale:1,no_observation:0,unknown:0},partial:false},
  ]});
  expect(JSON.stringify(daily.ratingFreshness)).not.toMatch(/SavedTest_|Private Learner|handle_revision/);
  expect(JSON.stringify(daily.ratingFreshness)).not.toContain(current.student_id);
  expect((await read(yesterday,true)).ratingFreshness).toEqual({status:"current_day_only"});
  expect((await page.request.get("/api/dashboard/summary?ratingFreshness=1")).status()).toBe(400);
  expect((await page.request.get("/api/dashboard/summary?date="+today+"&ratingFreshness=1&ratingFreshness=1")).status()).toBe(400);
  expect((await call("ccp_dashboard_summary",{ratingFreshness:true})).error?.code).toBe("VALIDATION_ERROR");
  await page.goto("/dashboard?date="+today);
  const region=page.getByRole("region",{name:"Current online rating freshness",exact:true});
  await region.getByRole("link",{name:"Review saved rating freshness",exact:true}).click();
  await expect(region.getByText("Checked recently: 1",{exact:true})).toBeVisible();
  await expect(region.getByText("Stale: 1",{exact:true})).toHaveCount(2);
  await expect(region.getByText("No saved check for this account: 1",{exact:true})).toBeVisible();
  expect((await call("ccp_workplace_context_set",{
   selectedWorkplaceId:venue,expectedSelectedWorkplaceId:null,confirmed:true,
  })).error).toBeUndefined();
  expect((await read(today,true)).ratingFreshness).toEqual({status:"workplace_scope_unavailable"});
  await page.reload();
  await expect(region.getByText("Select All workplaces",{exact:false})).toBeVisible();
  expect(await snapshot()).toEqual(before);
 }finally{
  for(const id of identities)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
