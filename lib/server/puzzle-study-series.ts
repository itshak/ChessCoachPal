import "server-only";
import {z} from "zod";
import {nextPuzzleStudyName,puzzleSeriesSuffix} from "@/lib/puzzle-study-names";
import {createServiceClient} from "@/lib/supabase/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {authorizedLichessToken,lichessOrigin} from "@/lib/server/lichess-connections";
import {teacherLichessStudiesSearch} from "@/lib/server/lichess-studies";

export const puzzleSeriesCreateSchema=z.object({
 expectedName:z.string().regex(/^Puzzles(?: [2-9][0-9]*)?$/),
 requestId:z.uuid(),confirmed:z.literal(true),confirmedExternal:z.literal(true),
}).strict();
export const puzzleSeriesReconcileSchema=z.object({
 requestId:z.uuid(),confirmedExternal:z.literal(true),confirmed:z.literal(true),
}).strict();
export const puzzleCapacitySchema=z.object({
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
}).strict();
export class PuzzleSeriesError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new PuzzleSeriesError(status,code,message);
const studyIdPattern=/^[A-Za-z0-9]{8}$/;
type Db=SupabaseClient;
type Series={id:string;name:string;createdAt:number|null;updatedAt:number|null};
async function providerSeries(teacherId:string){
 const list=await teacherLichessStudiesSearch(teacherId,{query:"Puzzles",limit:100});
 if(list.truncated)throw fail(409,"SERIES_AMBIGUOUS",
  "Too many studies to determine the next private Puzzles series safely");
 return list.studies.filter(s=>puzzleSeriesSuffix(s.name)!==null) as Series[];
}
export async function teacherPuzzleSeriesList(db:Db,teacherId:string){
 const provider=await providerSeries(teacherId);
 const {data,error}=await db.from("lichess_puzzle_series")
  .select("request_id,suffix,name,study_id,state,created_at,confirmed_at")
  .eq("teacher_id",teacherId).order("suffix").limit(101);
 if(error||!data||data.length===101)
  throw fail(503,"SERIES_UNAVAILABLE","Cannot verify local puzzle series requests");
 const known=[...provider.map(s=>s.name),...data.map(s=>s.name)];
 const next=nextPuzzleStudyName(known);
 if(next.nextSuffix>1000000)
  throw fail(413,"SERIES_LIMIT","Puzzle series suffix exhausted");
 return {studies:provider.map(s=>({id:s.id,name:s.name})),
  localReceipts:data,nextName:next.nextName,nextSuffix:next.nextSuffix,
  externalWrite:false,dailyLimit:30,
  note:"One newly created private study already contains a starter chapter. Existing provider-created studies may also count toward the Lichess daily limit."};
}
export async function teacherPuzzleStudyCapacity(teacherId:string,input:z.infer<typeof puzzleCapacitySchema>){
 const {studyId}=puzzleCapacitySchema.parse(input);
 const live=await teacherLichessStudiesSearch(teacherId,{studyId,limit:100});
 if(live.truncated||live.chapterCount<1||live.chapterCount>64)
  throw fail(503,"CAPACITY_UNVERIFIED","Cannot safely verify all study chapters");
 return {studyId,chapterCount:live.chapterCount,maxChapters:64,
  availableChapters:64-live.chapterCount,canPublish:live.chapterCount<64,
  source:"LIVE_AUTHORIZED_LICHESS_PGN",
  rolloverRequired:live.chapterCount>=64,
  note:"The Lichess 64-chapter cap includes any starter chapter; never delete unrelated chapters."};
}
async function providerCreateStudy(token:string,name:string){
 let res:Response;
 try{
  res=await fetch(lichessOrigin()+"/api/study",{
   method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
   headers:{Authorization:"Bearer "+token,
    "Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
   body:new URLSearchParams({name,visibility:"private",computer:"nobody",
    explorer:"nobody",cloneable:"nobody",shareable:"owner",chat:"nobody"}),
  });
 }catch{throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess did not confirm study creation. Inspect the series; do not retry with a new request ID.");}
 if(res.status===429)throw fail(429,"PROVIDER_RATE_LIMIT",
   "Lichess daily study quota was reached; reconcile the request before retry");
 if(!res.ok)throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess did not confirm private study creation; reconcile before retry");
 let data:unknown;
 try{data=await res.json();}catch{throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
  "Lichess returned an unreadable study receipt; reconcile before retry");}
 const id=(data as {id?:unknown}|null)?.id;
 if(typeof id!=="string"||!studyIdPattern.test(id))
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess returned an invalid study ID; reconcile before retry");
 return id;
}
export async function teacherPuzzleSeriesCreate(db:Db,teacherId:string,
 input:z.infer<typeof puzzleSeriesCreateSchema>){
 const x=puzzleSeriesCreateSchema.parse(input);
 const {token}=await authorizedLichessToken(teacherId,"study:write");
 // A live owner-scoped list determines a name; never let the chat choose
 // an arbitrary newly created external study.
 const next=await teacherPuzzleSeriesList(db,teacherId);
 if(x.expectedName!==next.nextName)
  throw fail(409,"STALE_SERIES_PREVIEW","Puzzle series names changed; review the current next name");
 const {data:claim,error}=await db.rpc("ccp_puzzle_series_claim",{
  p_suffix:next.nextSuffix,p_request_id:x.requestId,
 });
 if(error){
  if(error.code==="23505")throw fail(409,"SERIES_CONFLICT","Another request claimed the same puzzle series");
  if(error.code==="23514")throw fail(429,"SERIES_DAILY_LIMIT","Local 30/day study creation budget reached");
  throw fail(503,"SERIES_UNAVAILABLE","Unable to reserve a private series study");
 }
 if(claim?.replayed)
  throw fail(409,"PROVIDER_RECONCILIATION_REQUIRED",
   "This study creation request was already attempted; inspect or reconcile it, never send again");
 const studyId=await providerCreateStudy(token,next.nextName);
 const {data:saved,error:saveError}=await createServiceClient().from("lichess_puzzle_series")
  .update({state:"created",study_id:studyId,confirmed_at:new Date().toISOString()})
  .eq("teacher_id",teacherId).eq("request_id",x.requestId)
  .eq("state","attempted").select("request_id").maybeSingle();
 if(saveError||!saved)throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Study was created but local receipt was not saved; do not create another");
 return {studyId,name:next.nextName,private:true,starterChapterCount:1,
  replayed:false,createdExternally:true};
}
export async function teacherPuzzleSeriesReconcile(db:Db,teacherId:string,
 input:z.infer<typeof puzzleSeriesReconcileSchema>){
 const x=puzzleSeriesReconcileSchema.parse(input);
 const {data:claim,error}=await db.from("lichess_puzzle_series")
   .select("name,state,study_id").eq("teacher_id",teacherId)
   .eq("request_id",x.requestId).maybeSingle();
 if(error)throw fail(503,"SERIES_UNAVAILABLE","Cannot inspect private puzzle study receipt");
 if(!claim)throw fail(404,"NOT_FOUND","Puzzle study creation receipt unavailable");
 if(claim.state==="created"&&claim.study_id)return {
  studyId:claim.study_id,name:claim.name,replayed:true,reconciled:true};
 const matching=(await providerSeries(teacherId)).filter(s=>s.name===claim.name);
 if(matching.length!==1)throw fail(409,"RECONCILIATION_REQUIRED",
  "Study creation remains ambiguous; verify the exact destination in Lichess");
 const {data:saved,error:saveError}=await createServiceClient().from("lichess_puzzle_series")
  .update({state:"created",study_id:matching[0].id,confirmed_at:new Date().toISOString()})
  .eq("teacher_id",teacherId).eq("request_id",x.requestId).eq("state","attempted")
  .select("study_id").maybeSingle();
 if(saveError||!saved)throw fail(409,"RECONCILIATION_REQUIRED",
  "Private study receipt changed; review the series before proceeding");
 return {studyId:matching[0].id,name:claim.name,reconciled:true,
  remoteCallRepeated:false};
}
