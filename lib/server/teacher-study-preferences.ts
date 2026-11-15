import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

export const studyPreferencePurpose=z.enum(["lesson","puzzle"]);
export const studyPreferenceScope=z.enum(["teacher","workplace","student"]);
export const studyPreferenceListSchema=z.object({
 purpose:studyPreferencePurpose.optional(),scope:studyPreferenceScope.optional(),
 scopeId:z.uuid().optional(),
 limit:z.number().int().min(1).max(100).default(50),
 offset:z.number().int().min(0).max(100000).default(0),
}).strict();
export const studyPreferenceResolveSchema=z.object({
 purpose:studyPreferencePurpose,workplaceId:z.uuid().optional(),
 studentId:z.uuid().optional(),
}).strict();
export const studyPreferenceSetSchema=z.object({
 purpose:studyPreferencePurpose,scope:studyPreferenceScope,scopeId:z.uuid(),
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/).nullable(),
 expectedRevision:z.number().int().min(0).max(1000000000),
 requestId:z.uuid(),confirmed:z.literal(true),
}).strict();

export class StudyPreferenceError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new StudyPreferenceError(status,code,message);
type Db=SupabaseClient;
type Purpose=z.infer<typeof studyPreferencePurpose>;
type Scope=z.infer<typeof studyPreferenceScope>;
type Row={purpose:Purpose;scope:Scope;scope_id:string;study_id:string;
 revision:number;updated_at:string;created_at:string};
const fields="purpose,scope,scope_id,study_id,revision,updated_at,created_at";
async function owned(
 db:Db,teacherId:string,table:"workplaces"|"students",id:string
){
 const {data,error}=await db.from(table).select("id")
  .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
 if(error)throw fail(503,"DATABASE_ERROR","Teacher-owned scope lookup unavailable");
 if(!data)throw fail(404,"NOT_FOUND","Teacher-owned scope is unavailable");
}
export async function teacherStudyPreferencesList(
 db:Db,teacherId:string,input:z.infer<typeof studyPreferenceListSchema>,
){
 const a=studyPreferenceListSchema.parse(input);
 let query=db.from("teacher_study_preferences").select(fields,{count:"exact"})
  .eq("teacher_id",teacherId).order("purpose").order("scope")
  .order("scope_id").range(a.offset,a.offset+a.limit-1);
 if(a.purpose)query=query.eq("purpose",a.purpose);
 if(a.scope)query=query.eq("scope",a.scope);
 if(a.scopeId)query=query.eq("scope_id",a.scopeId);
 const {data,error,count}=await query;
 if(error||count===null)throw fail(503,"DATABASE_ERROR","Study preferences unavailable");
 return {preferences:(data??[]) as Row[],total:count,
  nextOffset:count>a.offset+(data?.length??0)?a.offset+(data?.length??0):null,
  studyLinksAreNotTeachingEvidence:true};
}
export async function teacherStudyPreferenceResolve(
 db:Db,teacherId:string,input:z.infer<typeof studyPreferenceResolveSchema>,
){
 const a=studyPreferenceResolveSchema.parse(input);
 if(a.workplaceId)await owned(db,teacherId,"workplaces",a.workplaceId);
 if(a.studentId)await owned(db,teacherId,"students",a.studentId);
 if(a.workplaceId&&a.studentId){
  const {data,error}=await db.from("workplace_enrollments").select("student_id")
   .eq("teacher_id",teacherId).eq("student_id",a.studentId)
   .eq("workplace_id",a.workplaceId).maybeSingle();
  if(error)throw fail(503,"DATABASE_ERROR","Student enrollment lookup unavailable");
  if(!data)throw fail(409,"STUDENT_NOT_ENROLLED",
   "The student is not enrolled in the requested workplace");
 }
 const keys:Array<{scope:Scope;scopeId:string}>=[
  {scope:"teacher",scopeId:teacherId},
  ...(a.workplaceId?[{scope:"workplace" as const,scopeId:a.workplaceId}]:[]),
  ...(a.studentId?[{scope:"student" as const,scopeId:a.studentId}]:[]),
 ];
 const result=await Promise.all(keys.map(({scope,scopeId})=>
  db.from("teacher_study_preferences").select(fields).eq("teacher_id",teacherId)
   .eq("purpose",a.purpose).eq("scope",scope)
   .eq("scope_id",scopeId).maybeSingle()));
 if(result.some(x=>x.error))throw fail(503,"DATABASE_ERROR","Study preference resolution unavailable");
 const levels=keys.map((key,i)=>({
  ...key,studyId:(result[i].data as Row|null)?.study_id??null,
  revision:(result[i].data as Row|null)?.revision??0,
 }));
 const chosen=[...levels].reverse().find(x=>x.studyId!==null)??null;
 let indexedAt:string|null=null;
 if(chosen?.studyId){
  const {data,error}=await db.from("teacher_study_chapter_index")
   .select("verified_at").eq("teacher_id",teacherId)
   .eq("study_id",chosen.studyId).order("verified_at",{ascending:false}).limit(1);
  if(error)throw fail(503,"DATABASE_ERROR","Indexed study freshness unavailable");
  indexedAt=data?.[0]?.verified_at??null;
 }
 const stale=!indexedAt||Date.now()-Date.parse(indexedAt)>86400000;
 return {purpose:a.purpose,workplaceId:a.workplaceId??null,
  studentId:a.studentId??null,studyId:chosen?.studyId??null,
  selectedScope:chosen?.scope??null,selectedScopeId:chosen?.scopeId??null,
  sourceRevision:chosen?.revision??0,levels,
  verifiedAt:indexedAt,needsSync:chosen?stale:false,
  accountAccessMustBeConfirmed:true,masteryInferred:false,
  explanation:"Student preference overrides workplace, then teacher. No source is guessed. A stale or unindexed study must be refreshed through authorized Lichess study:read before assignment."};
}
export async function teacherStudyPreferenceSet(
 db:Db,teacherId:string,input:z.infer<typeof studyPreferenceSetSchema>,
){
 void teacherId; // auth.uid() and scoped ownership inside SQL transaction.
 const a=studyPreferenceSetSchema.parse(input);
 const {data,error}=await db.rpc("ccp_teacher_study_preference_set",{
  p_purpose:a.purpose,p_scope:a.scope,p_scope_id:a.scopeId,
  p_study_id:a.studyId,p_expected_revision:a.expectedRevision,
  p_request_id:a.requestId,
 });
 if(error){
  if(error.code==="23505"||/STALE|REPLAY/.test(error.message))
   throw fail(409,"CONFLICT","Study preference revision or idempotency receipt changed; reload");
  if(error.code==="23514"||/UNVERIFIED/.test(error.message))
   throw fail(409,"SOURCE_UNVERIFIED","Sync this authorized Lichess study before saving the preference");
  if(error.code==="42501"||/UNAVAILABLE/.test(error.message))
   throw fail(404,"NOT_FOUND","Teacher-owned study preference scope unavailable");
  if(error.code==="22023"||/INVALID/.test(error.message))
   throw fail(400,"VALIDATION_ERROR","Invalid study preference update");
  throw fail(503,"DATABASE_ERROR","Study preference update unavailable");
 }
 return data as {purpose:Purpose;scope:Scope;scopeId:string;
  previousStudyId:string|null;studyId:string|null;revision:number;
  replayed:boolean;masteryInferred:false;providerTokenExposed:false};
}
