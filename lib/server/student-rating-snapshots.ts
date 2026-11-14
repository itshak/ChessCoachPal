import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createServiceClient} from "@/lib/supabase/server";
import {teacherStudentProfile} from "@/lib/server/student-profile-service";
import {ratingListSchema,ratingRecordSchema,ratingFetchSchema,
  parseLichessPerfs,parseChesscomStats,
  type RatingSnapshot} from "@/lib/chess-public-ratings";
import {z} from "zod";

export const ratingRefreshCommitSchema=ratingFetchSchema.extend({
  expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
  requestId:z.uuid(),confirmed:z.literal(true),
}).strict();
export class StudentRatingError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
  new StudentRatingError(status,code,message);
type Db=SupabaseClient;
type Provider=z.infer<typeof ratingFetchSchema>["provider"];
const fields="id,student_id,provider,time_control,rating,rating_deviation,provisional,games,source,observed_at,fetched_at,request_id,created_at,preview_digest,source_username";
const verifiedDigest=(studentId:string,provider:Provider,username:string,rows:RatingSnapshot[])=>{
  const values=rows.map(x=>[x.timeControl,x.rating,x.ratingDeviation,x.provisional,x.games])
    .sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify({studentId,provider,
    username:username.toLocaleLowerCase(),ratings:values})).digest("hex");
};
export async function teacherStudentRatingHistory(db:Db,teacherId:string,
 input:z.infer<typeof ratingListSchema>){
 const parsed=ratingListSchema.parse(input);
 await teacherStudentProfile(db,teacherId,parsed.studentId);
 let q=db.from("student_rating_snapshots").select(fields,{count:"exact"})
  .eq("teacher_id",teacherId).eq("student_id",parsed.studentId)
  .order("observed_at",{ascending:false}).order("id",{ascending:false})
  .range(parsed.offset,parsed.offset+parsed.limit-1);
 if(parsed.provider)q=q.eq("provider",parsed.provider);
 if(parsed.timeControl)q=q.eq("time_control",parsed.timeControl);
 const {data,error,count}=await q;
 if(error||count===null)throw fail(503,"RATINGS_UNAVAILABLE","Rating history could not be loaded");
 return {studentId:parsed.studentId,snapshots:(data??[]).slice(0,parsed.limit),
  total:count,nextOffset:count>parsed.offset+(data?.length??0)?
    parsed.offset+(data?.length??0):null,
  warning:"Provider/time-control ratings are not comparable. No value changes the teacher-assessed strength."};
}
export async function teacherStudentRatingRecord(db:Db,teacherId:string,
 input:z.infer<typeof ratingRecordSchema>){
 const a=ratingRecordSchema.parse(input);
 await teacherStudentProfile(db,teacherId,a.studentId);
 if(a.rating===null)throw fail(400,"VALIDATION_ERROR","An absent rating is not a rating snapshot");
 if(Date.parse(a.observedAt)>Date.now()+86400000)
  throw fail(400,"VALIDATION_ERROR","Observation cannot be in the future");
 const row={teacher_id:teacherId,student_id:a.studentId,provider:a.provider,
  time_control:a.timeControl,rating:a.rating,rating_deviation:a.ratingDeviation,
  provisional:a.provisional,games:a.games,source:"teacher_manual",
  observed_at:a.observedAt,fetched_at:null,request_id:a.requestId};
 const {data,error}=await db.from("student_rating_snapshots").insert(row)
   .select(fields).single();
 if(error?.code==="23505"){
  const {data:prior,error:lookupError}=await db.from("student_rating_snapshots")
   .select(fields).eq("teacher_id",teacherId).eq("request_id",a.requestId).maybeSingle();
  if(lookupError)throw fail(503,"RATINGS_UNAVAILABLE","Rating replay could not be verified");
  if(prior&&prior.student_id===a.studentId&&prior.provider===a.provider&&
    prior.time_control===a.timeControl&&prior.rating===a.rating&&
    Date.parse(prior.observed_at)===Date.parse(a.observedAt)&&prior.rating_deviation===a.ratingDeviation&&
    prior.provisional===a.provisional&&prior.games===a.games&&prior.source==="teacher_manual")
    return {snapshot:prior,replayed:true};
  throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to another rating observation");
 }
 if(error||!data)throw fail(503,"RATINGS_UNAVAILABLE","Cannot record manual rating snapshot");
 return {snapshot:data,replayed:false};
}
function endpoint(provider:Provider,username:string){
 const official=provider==="lichess"?"https://lichess.org":"https://api.chess.com";
 // Fixed loopback host is only permitted for synthetic CI; never honor a
 // URL or host from the teacher, student or plugin input.
 const synthetic=process.env.CI==="true"&&
  process.env.CCP_SYNTHETIC_RATINGS_ORIGIN==="http://127.0.0.1:3995";
 const origin=synthetic?"http://127.0.0.1:3995":official;
 return origin+(provider==="lichess"?"/api/user/":"/pub/player/")+
  encodeURIComponent(username)+(provider==="lichess"?"":"/stats");
}
async function providerData(provider:Provider,username:string){
 let response:Response;
 try{response=await fetch(endpoint(provider,username),{
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
  headers:{"Accept":"application/json"},
 });}catch{throw fail(502,"PROVIDER_UNAVAILABLE","Public rating provider unavailable");}
 if(response.status===429)throw fail(429,"RATE_LIMITED","Rating provider rate limit; retry later");
 if(response.status===404)throw fail(404,"ACCOUNT_NOT_FOUND","Public chess account not found");
 if(response.status===401||response.status===403)
  throw fail(403,"PROVIDER_DENIED","Public rating lookup was denied");
 if(!response.ok)throw fail(502,"PROVIDER_UNAVAILABLE","Public rating provider unavailable");
 const size=Number(response.headers.get("content-length")??"0");
 if(Number.isFinite(size)&&size>80000)
  throw fail(502,"PROVIDER_RESPONSE","Public rating response exceeds safe size");
 const text=await response.text();
 if(Buffer.byteLength(text,"utf8")>80000)
  throw fail(502,"PROVIDER_RESPONSE","Public rating response exceeds safe size");
 try{return JSON.parse(text) as unknown;}
 catch{throw fail(502,"PROVIDER_RESPONSE","Public rating response is unreadable");}
}
export async function teacherStudentRatingRefreshPreview(db:Db,teacherId:string,
 input:z.infer<typeof ratingFetchSchema>){
 const x=ratingFetchSchema.parse(input);
 const profile=await teacherStudentProfile(db,teacherId,x.studentId);
 if(profile.archived_at)throw fail(409,"STUDENT_ARCHIVED","Cannot refresh an archived learner's chess identity");
 const username=x.provider==="lichess"?profile.lichess_username:profile.chesscom_username;
 if(typeof username!=="string"||!/^[A-Za-z0-9_-]{2,30}$/.test(username))
  throw fail(400,"ACCOUNT_NOT_CONFIGURED","Enter a public chess username for this provider first");
 const now=new Date().toISOString();
 const raw=await providerData(x.provider,username);
 let ratings:RatingSnapshot[];
 try{ratings=x.provider==="lichess"?parseLichessPerfs(raw,now):
  parseChesscomStats(raw,now);}
 catch{throw fail(502,"PROVIDER_RESPONSE","Provider rating categories were invalid");}
 if(!ratings.length)throw fail(422,"RATING_UNAVAILABLE",
  "No published ratings for this account's supported time controls");
 return {studentId:x.studentId,provider:x.provider,username,ratings,
  expectedDigest:verifiedDigest(x.studentId,x.provider,username,ratings),
  readOnly:true,accountOwnershipVerified:false,teacherStrengthChanged:false,
  note:"Review each provider/time-control value before recording. This does not prove the account belongs to the student."};
}
export async function teacherStudentRatingRefreshCommit(db:Db,teacherId:string,
 input:z.infer<typeof ratingRefreshCommitSchema>){
 const x=ratingRefreshCommitSchema.parse(input);
 // Before accessing the external provider check request receipt: an exact
 // replay must not trigger a second network call or duplicate observations.
 const {data:previous,error:priorError}=await db.from("student_rating_snapshots")
  .select(fields).eq("teacher_id",teacherId).eq("request_id",x.requestId)
  .order("time_control");
 if(priorError)throw fail(503,"RATINGS_UNAVAILABLE","Cannot verify rating refresh replay");
 if(previous?.length){
  // Existing request IDs may not be rebound to a different student/provider.
  if(previous.some(r=>r.student_id!==x.studentId||r.provider!==x.provider||
    r.source!=="provider_api"||r.preview_digest!==x.expectedDigest))
   throw fail(409,"IDEMPOTENCY_CONFLICT",
    "Rating refresh UUID was reused with different reviewed source evidence");
  // Fetching is deliberately NOT repeated on successful committed retries.
  return {studentId:x.studentId,snapshots:previous,replayed:true,
    provider:x.provider,teacherStrengthChanged:false};
 }
 // The reviewed commit adds receipt and digest fields; the read-only
 // provider-preview schema is deliberately strict and must receive only
 // its own whitelisted inputs.
 const preview=await teacherStudentRatingRefreshPreview(db,teacherId,{
   studentId:x.studentId,provider:x.provider,confirmedExternal:true,
 });
 if(preview.expectedDigest!==x.expectedDigest)
  throw fail(409,"STALE_RATING_PREVIEW","Public rating data changed; review again");
 const admin=createServiceClient();
 const rows=preview.ratings.filter(x=>x.rating!==null).map(row=>({
  teacher_id:teacherId,student_id:x.studentId,
  provider:x.provider,time_control:row.timeControl,rating:row.rating,
  rating_deviation:row.ratingDeviation,provisional:row.provisional,
  games:row.games,source:"provider_api",observed_at:row.observedAt,
  fetched_at:row.fetchedAt,request_id:x.requestId,
  preview_digest:x.expectedDigest,source_username:preview.username,
 }));
 const {data,error}=await admin.from("student_rating_snapshots")
  .insert(rows).select(fields);
 if(error?.code==="23505")throw fail(409,"IDEMPOTENCY_CONFLICT",
  "Concurrent refresh already claimed this request; re-read history");
 if(error||!data)throw fail(503,"RATINGS_UNAVAILABLE","Could not save provider observations");
 return {studentId:x.studentId,snapshots:data,replayed:false,
  provider:x.provider,teacherStrengthChanged:false};
}
