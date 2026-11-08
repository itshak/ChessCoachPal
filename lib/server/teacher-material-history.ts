import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db=SupabaseClient;
const uuid=z.string().uuid();
const date=z.string().date();
export const materialsHistoryFilter=z.object({
 studentId:uuid.optional(),workplaceId:uuid.optional(),sessionId:uuid.optional(),
 resourceId:uuid.optional(),
 stage:z.enum(["assigned","taught","completed"]).optional(),
 from:date.optional(),to:date.optional(),
 includeVoided:z.boolean().default(false),
 offset:z.number().int().min(0).max(100000).default(0),
 limit:z.number().int().min(1).max(100).default(50),
}).strict().refine(v=>Boolean(v.studentId||v.workplaceId||v.sessionId),{
 message:"Filter by student, workplace, or session to avoid unbounded student disclosure",
}).refine(v=>!v.from||!v.to||v.from<=v.to,{message:"End date precedes start date"});
export const materialsHistoryRecord=z.object({
 studentId:uuid,resourceId:uuid,workplaceId:uuid.optional(),sessionId:uuid.optional(),
 stage:z.enum(["assigned","taught","completed"]),occurredOn:date,
 note:z.string().trim().max(2000).default(""),
 requestId:uuid,confirmed:z.literal(true),
}).strict();
export const materialsHistoryVoid=z.object({
 entryId:uuid,expectedUpdatedAt:z.string().datetime({offset:true}),
 reason:z.string().trim().min(5).max(500),confirmed:z.literal(true),
}).strict();

export class MaterialHistoryError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(status:number,code:string,message:string)=>new MaterialHistoryError(status,code,message);
type MaterialRecord=z.infer<typeof materialsHistoryRecord>;
type MaterialFilter=z.infer<typeof materialsHistoryFilter>;

async function validateDependencies(db:Db,teacherId:string,input:MaterialRecord){
 const [student,resource,workplace,session]=await Promise.all([
   db.from("students").select("id").eq("teacher_id",teacherId).eq("id",input.studentId).maybeSingle(),
   db.from("chess_learning_resources").select("id,student_id,session_id")
     .eq("teacher_id",teacherId).eq("id",input.resourceId).maybeSingle(),
   input.workplaceId?db.from("workplaces").select("id")
     .eq("teacher_id",teacherId).eq("id",input.workplaceId).maybeSingle():Promise.resolve({data:null,error:null}),
   input.sessionId?db.from("teaching_sessions").select("id,workplace_id")
     .eq("teacher_id",teacherId).eq("id",input.sessionId).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 if(student.error||resource.error||workplace.error||session.error)
   throw failure(500,"DATABASE_ERROR","Unable to validate material history ownership");
 if(!student.data||!resource.data||(input.workplaceId&&!workplace.data)||
    (input.sessionId&&!session.data)) throw failure(404,"NOT_FOUND","One or more selected records are unavailable");
 if(resource.data.student_id && resource.data.student_id!==input.studentId)
   throw failure(409,"CONFLICT","Material link belongs to a different student");
 if(resource.data.session_id && resource.data.session_id!==input.sessionId)
   throw failure(409,"CONFLICT","Material link belongs to a different session");
 if(session.data&&session.data.workplace_id!==input.workplaceId)
   throw failure(409,"CONFLICT","Session and workplace must match");
 // Database trigger independently validates frozen session membership / active enrollment.
}
const selectFields="id,teacher_id,student_id,workplace_id,session_id,resource_id,stage,occurred_on,note,request_id,created_at,updated_at,voided_at,void_reason";
export async function teacherMaterialHistory(db:Db,teacherId:string,filter:MaterialFilter){
 if(!filter.studentId&&!filter.workplaceId&&!filter.sessionId)
   throw failure(400,"VALIDATION_ERROR","Select a student, workplace, or session");
 if(filter.from&&filter.to&&filter.from>filter.to)
   throw failure(400,"VALIDATION_ERROR","Invalid date range");
 // Check resource ownership even for empty results; foreign IDs never reveal
 // whether another coach has material history.
 for(const [table,id] of [
  ["students",filter.studentId],
  ["workplaces",filter.workplaceId],
  ["teaching_sessions",filter.sessionId],
 ] as const){
  if(!id)continue;
  const {data:owned,error:ownedError}=await db.from(table).select("id")
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(ownedError)throw failure(500,"DATABASE_ERROR","Unable to verify material filter");
  if(!owned)throw failure(404,"NOT_FOUND","Selected student, workplace or lesson not found");
 }

 const limit=Math.min(100,Math.max(1,filter.limit??50));
 const offset=Math.min(100000,Math.max(0,filter.offset??0));
 let query=db.from("chess_material_progress").select(
  selectFields+",students(name),chess_learning_resources(label,url,resource_type,provider_study_id,provider_chapter_id)",
  {count:"exact"}
 ).eq("teacher_id",teacherId).order("occurred_on",{ascending:false})
  .order("created_at",{ascending:false}).order("id")
  .range(offset,offset+limit);
 if(filter.studentId)query=query.eq("student_id",filter.studentId);
 if(filter.workplaceId)query=query.eq("workplace_id",filter.workplaceId);
 if(filter.sessionId)query=query.eq("session_id",filter.sessionId);
 if(filter.resourceId)query=query.eq("resource_id",filter.resourceId);
 if(filter.stage)query=query.eq("stage",filter.stage);
 if(filter.from)query=query.gte("occurred_on",filter.from);
 if(filter.to)query=query.lte("occurred_on",filter.to);
 if(!filter.includeVoided)query=query.is("voided_at",null);
 const {data,error,count}=await query;
 if(error)throw failure(500,"DATABASE_ERROR","Material history unavailable");
 const rows=(data??[]).slice(0,limit);
 return {entries:rows,total:count??0,nextOffset:(data?.length??0)>limit?offset+limit:null,
  pageSummary:{
   entries:rows.length,
   studentCount:new Set(rows.map(x=>x.student_id)).size,
   // Distinct session/resource claims avoid counting a group lesson per student.
   uniqueSessionMaterialCount:new Set(rows.filter(x=>x.session_id)
     .map(x=>x.session_id+"|"+x.resource_id+"|"+x.stage)).size,
  },summaryScope:"current_page",truthBasis:"explicit_teacher_record_only"};
}
export async function teacherMaterialRecord(db:Db,teacherId:string,input:MaterialRecord){
 await validateDependencies(db,teacherId,input);
 const toInsert={
  teacher_id:teacherId,student_id:input.studentId,workplace_id:input.workplaceId??null,
  session_id:input.sessionId??null,resource_id:input.resourceId,stage:input.stage,
  occurred_on:input.occurredOn,note:input.note,request_id:input.requestId,
 };
 const {data,error}=await db.from("chess_material_progress").insert(toInsert)
   .select(selectFields).single();
 if(error?.code==="23505"){
  const {data:old, error:readError}=await db.from("chess_material_progress")
    .select(selectFields).eq("teacher_id",teacherId).eq("request_id",input.requestId).maybeSingle();
  if(readError)throw failure(500,"DATABASE_ERROR","Cannot reconcile material history idempotency");
  if(old&&old.student_id===toInsert.student_id&&old.workplace_id===toInsert.workplace_id&&
    old.session_id===toInsert.session_id&&old.resource_id===toInsert.resource_id&&
    old.stage===toInsert.stage&&old.occurred_on===toInsert.occurred_on&&
    old.note===toInsert.note) return {...old,replayed:true};
  throw failure(409,"IDEMPOTENCY_CONFLICT","Request ID already belongs to a different material claim");
 }
 if(error)throw failure(400,"VALIDATION_ERROR","Material claim rejected: review student enrollment and session roster");
 return {...data,replayed:false};
}
export async function teacherMaterialVoid(db:Db,teacherId:string,
 input:z.infer<typeof materialsHistoryVoid>){
 const {data,error}=await db.from("chess_material_progress").update({
  voided_at:new Date().toISOString(),void_reason:input.reason,
 }).eq("id",input.entryId).eq("teacher_id",teacherId)
  .eq("updated_at",input.expectedUpdatedAt).is("voided_at",null)
  .select(selectFields).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Could not correct material claim");
 if(!data){
  const {data:existing}=await db.from("chess_material_progress")
    .select("id").eq("id",input.entryId).eq("teacher_id",teacherId).maybeSingle();
  throw existing?failure(409,"CONFLICT","Material claim changed, already voided or stale; reload history"):
    failure(404,"NOT_FOUND","Material claim not found");
 }
 return {ok:true,entry:data};
}
