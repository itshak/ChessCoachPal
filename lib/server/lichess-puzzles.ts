import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {buildPuzzlePreview,PuzzleReviewError,type PuzzleDraft} from "@/lib/lichess-puzzles";
import {authorizedLichessToken,lichessOrigin} from "@/lib/server/lichess-connections";
import {teacherMaterialCatalogCreate} from "@/lib/server/learning-materials";

export class LichessPuzzleError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new LichessPuzzleError(status,code,message);
const chapterIdPattern=/^[A-Za-z0-9]{8}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const uuidPattern=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
type Receipt={
 id:string;request_id:string;content_hash:string;study_id:string;chapter_name:string;
 status:"attempted"|"published"|"failed";provider_chapter_id:string|null;
};
export function teacherLichessPuzzlePreview(input:PuzzleDraft){
 try{return buildPuzzlePreview(input);}
 catch(error){
  if(error instanceof PuzzleReviewError)
   throw fail(400,error.code,error.message);
  throw error;
 }
}
async function existingPublication(db:SupabaseClient,teacherId:string,
 studyId:string,requestId:string,hash:string):Promise<Receipt|null>{
 const [{data:request,error:requestError},{data:content,error:contentError}]=await Promise.all([
  db.from("lichess_puzzle_publications").select("*")
   .eq("teacher_id",teacherId).eq("request_id",requestId).maybeSingle(),
  db.from("lichess_puzzle_publications").select("*")
   .eq("teacher_id",teacherId).eq("study_id",studyId)
   .eq("content_hash",hash).maybeSingle(),
 ]);
 if(requestError||contentError)
  throw fail(500,"DATABASE_ERROR","Could not inspect Lichess publication receipts");
 if(request&&request.content_hash!==hash)
  throw fail(409,"IDEMPOTENCY_CONFLICT","This publishing request ID was already used for different reviewed content");
 return (request??content) as Receipt|null;
}
/**
 * Reconcile an externally confirmed chapter to the single typed catalog.
 * The Lichess request receipt is authoritative; a failed DB material link
 * must NEVER trigger another remote import. Local retries are safe because
 * the catalog key is the original validated publication UUID.
 */
async function ensureCatalogChapter(
 db:SupabaseClient,teacherId:string,row:Receipt
){
 if(row.status!=="published"||!row.provider_chapter_id)
  throw fail(409,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess publication status is ambiguous. Inspect the study before retrying");
 const chapterUrl=`https://lichess.org/study/${row.study_id}/${row.provider_chapter_id}`;
 try{
  const result=await teacherMaterialCatalogCreate(db,teacherId,{
   kind:"study_chapter",
   title:row.chapter_name,
   description:"Teacher-approved Lichess puzzle chapter",
   sourceUrl:chapterUrl,
   details:{provider:"lichess",studyId:row.study_id,chapterId:row.provider_chapter_id},
   requestId:row.request_id,
  });
  return {materialId:result.material.id as string,chapterUrl};
 }catch{
  throw fail(503,"MATERIAL_SYNC_PENDING",
   "The Lichess chapter is published but the typed learning material could not be linked. Reuse the same publishing request to reconcile locally; do not republish");
 }
}
async function handleExisting(db:SupabaseClient,teacherId:string,row:Receipt){
 const {materialId,chapterUrl}=await ensureCatalogChapter(db,teacherId,row);
 return {
  ok:true,replayed:true,studyId:row.study_id,chapterId:row.provider_chapter_id,
  chapterName:row.chapter_name,chapterUrl,materialId,
 };
}
export async function teacherLichessPuzzlePublish(
 db:SupabaseClient,teacherId:string,
 input:PuzzleDraft&{expectedSha256:string;idempotencyKey:string}
){
 const preview=teacherLichessPuzzlePreview(input);
 if(!hashPattern.test(input.expectedSha256)||
    input.expectedSha256!==preview.sha256)
  throw fail(409,"PREVIEW_CHANGED","The reviewed puzzle changed; preview and approve the current FEN, moves and destination again");
 if(!uuidPattern.test(input.idempotencyKey))
  throw fail(400,"VALIDATION_ERROR","A UUID publishing request key is required");
 // A scope escalation always requires separate explicit browser OAuth consent.
 const {token}=await authorizedLichessToken(teacherId,"study:write");
 const prior=await existingPublication(db,teacherId,
  preview.studyId,input.idempotencyKey,preview.sha256);
 if(prior)return handleExisting(db,teacherId,prior);
 // Database unique constraints are the cross-client at-most-once provider claim.
 const {data:receipt,error:claimError}=await db.from("lichess_puzzle_publications")
  .insert({
   teacher_id:teacherId,study_id:preview.studyId,request_id:input.idempotencyKey,
   content_hash:preview.sha256,chapter_name:preview.chapterName,status:"attempted",
  }).select("id").single();
 if(claimError?.code==="23505"){
  const seen=await existingPublication(db,teacherId,
   preview.studyId,input.idempotencyKey,preview.sha256);
  if(seen)return handleExisting(db,teacherId,seen);
  throw fail(409,"PROVIDER_RECONCILIATION_REQUIRED","A Lichess publishing attempt is already in progress");
 }
 if(claimError||!receipt)
  throw fail(500,"DATABASE_ERROR","Could not reserve a unique Lichess publishing attempt");
 let response:Response;
 try{
  response=await fetch(
   `${lichessOrigin()}/api/study/${preview.studyId}/import-pgn`,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/json",
      "Content-Type":"application/x-www-form-urlencoded",
    },
    body:new URLSearchParams({
      pgn:preview.pgn,name:preview.chapterName,orientation:preview.orientation,mode:"practice",
    }),
    signal:AbortSignal.timeout(12000),
   });
 }catch{
  // Do not reattempt: the provider may have created the chapter before timeout.
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess did not confirm the chapter import. Inspect the destination study before retrying");
 }
 if(response.status===400||response.status===401||response.status===403){
  const {error}=await db.from("lichess_puzzle_publications")
    .update({status:"failed"}).eq("teacher_id",teacherId).eq("id",receipt.id);
  if(error)throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED","Could not record the rejected Lichess response");
  throw fail(response.status===400?400:403,
    response.status===400?"PROVIDER_REJECTED":"SCOPE_DENIED",
    response.status===400?
      "Lichess rejected the PGN or destination; correct the preview before another import":
      "Lichess did not authorize this study; check study ownership and browser grant");
 }
 if(!response.ok)
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess did not confirm the chapter import; do not automatically repeat it");
 let parsed:unknown;
 try{parsed=await response.json();}catch{
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess returned an ambiguous import receipt; inspect the study");
 }
 const body=parsed as {chapters?:Array<{id?:unknown;name?:unknown}>}|null;
 const chapters=Array.isArray(body?.chapters)?body.chapters:[];
 const created=chapters.find(row=>typeof row.id==="string"&&chapterIdPattern.test(row.id));
 if(!created||typeof created.id!=="string")
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess import returned no verifiable chapter ID; inspect the study");
 const {data:saved,error:saveError}=await db.from("lichess_puzzle_publications")
  .update({
   status:"published",provider_chapter_id:created.id,
   published_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",receipt.id).eq("status","attempted")
  .select("id").maybeSingle();
 if(saveError||!saved)
  throw fail(503,"PROVIDER_RECONCILIATION_REQUIRED",
   "Lichess published the chapter but its local receipt could not be stored; inspect the study");
 const {materialId,chapterUrl}=await ensureCatalogChapter(db,teacherId,{
   id:receipt.id,request_id:input.idempotencyKey,content_hash:preview.sha256,
   study_id:preview.studyId,chapter_name:preview.chapterName,
   status:"published",provider_chapter_id:created.id,
 });
 return {
  ok:true,replayed:false,studyId:preview.studyId,chapterId:created.id,
  chapterName:preview.chapterName,chapterUrl,materialId,
 };
}
