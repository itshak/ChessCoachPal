import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createServiceClient} from "@/lib/supabase/server";
import {teacherStudentProfile} from "@/lib/server/student-profile-service";
import {ratingListSchema,ratingRecordSchema,ratingFetchSchema,
  parseLichessPerfs,parseChesscomStats,
  type RatingSnapshot} from "@/lib/chess-public-ratings";
import {z} from "zod";
import {fetchOnlineRatingPayload,StudentRatingError} from "./online-rating-transport";

export const ratingRefreshCommitSchema=ratingFetchSchema.extend({
  expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
  requestId:z.uuid(),confirmed:z.literal(true),
}).strict();
export {StudentRatingError};
const fail=(status:number,code:string,message:string)=>
  new StudentRatingError(status,code,message);
type Db=SupabaseClient;
type Provider=z.infer<typeof ratingFetchSchema>["provider"];
const fields="id,student_id,provider,time_control,rating,rating_deviation,provisional,games,source,observed_at,fetched_at,request_id,created_at,preview_digest,source_username";
const verifiedDigest=(studentId:string,provider:Provider,username:string,epoch:string,rows:RatingSnapshot[])=>{
 const values=rows.filter(x=>x.rating!==null).sort((a,b)=>a.timeControl<b.timeControl?-1:a.timeControl>b.timeControl?1:0)
  .map(x=>[x.timeControl,x.rating,x.ratingDeviation,x.provisional,x.games]);
 return createHash("sha256").update(JSON.stringify(["manual-online-rating-v2",studentId.toLowerCase(),provider,username,epoch,values])).digest("hex");
};
const receiptFields="id,student_id,provider,time_control,rating,rating_deviation,provisional,games,source,observed_at,fetched_at,request_id,created_at,preview_digest,source_username,source_handle_revision,verification_state,provider_list_version";
const receiptBound=20;
const bindingShape=z.object({epoch:z.string().regex(/^[1-9][0-9]{0,18}$/),archived:z.boolean(),handle:z.string().nullable()}).strict();
async function ratingReceipt(db:Db,teacherId:string,requestId:string){
 const {data,error,count}=await db.from("student_rating_snapshots").select(receiptFields,{count:"exact"})
  .eq("teacher_id",teacherId).eq("request_id",requestId).order("time_control").limit(receiptBound+1);
 if(error||!data||count!==data.length)throw fail(503,"RATINGS_UNAVAILABLE","Rating replay could not be verified");
 if(data.length>receiptBound)throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to incompatible rating history");
 return data;
}
function snapshotDto<T extends {source_handle_revision:unknown;verification_state:unknown;provider_list_version:unknown}>(row:T){
 const {source_handle_revision,verification_state,provider_list_version,...snapshot}=row;
 void source_handle_revision; void verification_state; void provider_list_version;
 return snapshot;
}
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
  const receipt=await ratingReceipt(db,teacherId,a.requestId);
  const prior=receipt.length===1?receipt[0]:null;
  if(prior&&prior.student_id===a.studentId.toLowerCase()&&prior.provider===a.provider&&
    prior.time_control===a.timeControl&&prior.rating===a.rating&&
    Date.parse(prior.observed_at)===Date.parse(a.observedAt)&&prior.rating_deviation===a.ratingDeviation&&
    prior.provisional===a.provisional&&prior.games===a.games&&prior.source==="teacher_manual")
    return {snapshot:snapshotDto(prior),replayed:true};
  throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to another rating observation");
 }
 if(error?.code==="55P03"||error?.code==="40001")throw fail(409,"RATING_CONTEXT_BUSY","Student context is busy; retry this exact request");
 if(error||!data)throw fail(503,"RATINGS_UNAVAILABLE","Cannot record manual rating snapshot");
 return {snapshot:data,replayed:false};
}
async function reviewedOnlineEvidence(db:Db,teacherId:string,x:z.infer<typeof ratingFetchSchema>){
 // End-user client must prove tenant ownership before the narrow admin read.
 await teacherStudentProfile(db,teacherId,x.studentId);
 const {data,error}=await createServiceClient().rpc("ccp_manual_online_rating_binding",{
   p_teacher_id:teacherId,p_student_id:x.studentId,p_provider:x.provider,
 });
 if(error)throw fail(503,"RATINGS_UNAVAILABLE","Could not verify student rating binding");
 const binding=bindingShape.safeParse(data);
 if(!binding.success)throw fail(404,"NOT_FOUND","Student not found");
 if(binding.data.archived)throw fail(409,"STUDENT_ARCHIVED","Cannot refresh an archived learner's chess identity");
 const username=binding.data.handle;
 if(typeof username!=="string"||!/^[A-Za-z0-9_-]{2,30}$/.test(username))
  throw fail(400,"ACCOUNT_NOT_CONFIGURED","Enter a public chess username for this provider first");
 const fetchedAt=new Date().toISOString();
 const raw=await fetchOnlineRatingPayload(x.provider,username);
 let ratings:RatingSnapshot[];
 try{ratings=x.provider==="lichess"?parseLichessPerfs(raw,fetchedAt):parseChesscomStats(raw,fetchedAt);}
 catch{throw fail(502,"PROVIDER_RESPONSE","Provider rating categories were invalid");}
 if(!ratings.some(row=>row.rating!==null))throw fail(422,"RATING_UNAVAILABLE",
  "No published ratings for this account's supported time controls");
 return {epoch:binding.data.epoch,fetchedAt,preview:{studentId:x.studentId,provider:x.provider,username,ratings,
  expectedDigest:verifiedDigest(x.studentId,x.provider,username,binding.data.epoch,ratings),
  readOnly:true,accountOwnershipVerified:false,teacherStrengthChanged:false,
  note:"Review each provider/time-control value before recording. This does not prove the account belongs to the student."}};
}
export async function teacherStudentRatingRefreshPreview(db:Db,teacherId:string,
 input:z.infer<typeof ratingFetchSchema>){
 return (await reviewedOnlineEvidence(db,teacherId,ratingFetchSchema.parse(input))).preview;
}
export async function teacherStudentRatingRefreshCommit(db:Db,teacherId:string,
 input:z.infer<typeof ratingRefreshCommitSchema>){
 const x=ratingRefreshCommitSchema.parse(input);
 const matches=(rows:Awaited<ReturnType<typeof ratingReceipt>>)=>rows.length>0&&rows.every(r=>
  r.student_id===x.studentId.toLowerCase()&&r.provider===x.provider&&r.source==="provider_api"&&
  r.verification_state==="unverified"&&r.source_handle_revision===null&&r.provider_list_version===null&&r.preview_digest===x.expectedDigest)&&
  new Set(rows.map(r=>r.source_username)).size===1&&new Set(rows.map(r=>r.time_control)).size===rows.length;
 const response=(rows:Awaited<ReturnType<typeof ratingReceipt>>,replayed:boolean)=>(
  {studentId:x.studentId,snapshots:rows.map(snapshotDto),replayed,provider:x.provider,teacherStrengthChanged:false});
 // Exact existing receipts, including the previous digest version, replay
 // before mutable student checks or a provider request.
 const previous=await ratingReceipt(db,teacherId,x.requestId);
 if(previous.length){
  if(!matches(previous))throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to another rating observation");
  return response(previous,true);
 }
 const {epoch,fetchedAt,preview}=await reviewedOnlineEvidence(db,teacherId,{
  studentId:x.studentId,provider:x.provider,confirmedExternal:true,
 });
 if(preview.expectedDigest!==x.expectedDigest)
  throw fail(409,"STALE_RATING_PREVIEW","Public rating evidence or linked account changed; review again");
 const observations=preview.ratings.filter(row=>row.rating!==null).map(row=>({
  time_control:row.timeControl,rating:row.rating,rating_deviation:row.ratingDeviation,
  provisional:row.provisional,games:row.games,observed_at:row.observedAt,
 }));
 const {data,error}=await createServiceClient().rpc("ccp_manual_online_rating_commit",{
  p_teacher_id:teacherId,p_student_id:x.studentId,p_provider:x.provider,p_handle:preview.username,
  p_epoch:epoch,p_request_id:x.requestId,p_preview_digest:x.expectedDigest,p_fetched_at:fetchedAt,p_observations:observations,
 });
 if(error?.code==="23505")throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID belongs to another rating observation");
 if(error?.code==="55P03"||error?.code==="40001")throw fail(409,"RATING_CONTEXT_BUSY","Student context is busy; retry this exact request");
 if(error?.message==="RATING_MANUAL_REFRESH_STALE"||error?.message==="RATING_MANUAL_REFRESH_EVIDENCE_MISMATCH")
  throw fail(409,"STALE_RATING_PREVIEW","Public rating evidence or linked account changed; review again");
 if(error||typeof data?.replayed!=="boolean")throw fail(503,"RATINGS_UNAVAILABLE","Could not save provider observations");
 const saved=await ratingReceipt(db,teacherId,x.requestId);
 if(!matches(saved)||saved.length!==observations.length)throw fail(503,"RATINGS_UNAVAILABLE","Could not verify committed rating evidence");
 return response(saved,data.replayed);
}
