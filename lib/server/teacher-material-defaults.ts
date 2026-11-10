import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

const uuid=z.string().uuid();
const studyUrl=z.string().trim().url().max(500).regex(
 /^https:\/\/lichess[.]org\/study\/[A-Za-z0-9]{8}(\/[A-Za-z0-9]{8})?\/?$/,
 "Use an official Lichess study or chapter URL");
export const defaultCreateSchema=z.object({
 operation:z.literal("default.create"),workplaceId:uuid,groupId:uuid.nullable().optional(),
 label:z.string().trim().min(1).max(160),url:studyUrl,
 notes:z.string().max(1000).default(""),requestId:uuid,confirmed:z.literal(true),
}).strict();
export const defaultUpdateSchema=z.object({
 operation:z.literal("default.update"),defaultId:uuid,
 expectedUpdatedAt:z.string().datetime({offset:true}),
 label:z.string().trim().min(1).max(160).optional(),url:studyUrl.optional(),
 notes:z.string().max(1000).optional(),confirmed:z.literal(true),
}).strict().refine(v=>v.label!==undefined||v.url!==undefined||v.notes!==undefined,
 "At least one edit required");
export const defaultArchiveSchema=z.object({
 operation:z.literal("default.archive"),defaultId:uuid,
 expectedUpdatedAt:z.string().datetime({offset:true}),confirmed:z.literal(true),
}).strict();
export class MaterialDefaultError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new MaterialDefaultError(status,code,message);
type Db=SupabaseClient;
const fields="id,workplace_id,group_id,label,url,notes,created_at,updated_at,archived_at,request_id";

async function ownedWorkplace(db:Db,teacherId:string,workplaceId:string){
 const {data,error}=await db.from("workplaces").select("id")
  .eq("id",workplaceId).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Workplace unavailable");
 if(!data)throw fail(404,"NOT_FOUND","Workplace not found");
}
export async function teacherMaterialDefaultsList(
 db:Db,teacherId:string,input:{workplaceId:string;groupId?:string;includeArchived?:boolean}
){
 await ownedWorkplace(db,teacherId,input.workplaceId);
 if(input.groupId){
  const {data, error}=await db.from("class_groups").select("id")
    .eq("teacher_id",teacherId).eq("workplace_id",input.workplaceId)
    .eq("id",input.groupId).maybeSingle();
  if(error)throw fail(500,"DATABASE_ERROR","Group unavailable");
  if(!data)throw fail(404,"NOT_FOUND","Group not found in this workplace");
 }
 let query=db.from("chess_material_defaults").select(fields)
  .eq("teacher_id",teacherId).eq("workplace_id",input.workplaceId)
  .order("created_at",{ascending:false}).limit(1000);
 if(input.groupId)query=query.eq("group_id",input.groupId);
 if(!input.includeArchived)query=query.is("archived_at",null);
 const {data,error}=await query;
 if(error)throw fail(500,"DATABASE_ERROR","Material defaults unavailable");
 const defaults=data??[];
 const ids=defaults.map(d=>d.id);
 let history:unknown[]=[];
 if(ids.length>0){
  const records=await db.from("chess_material_default_history")
   .select("id,default_id,action,before_value,after_value,created_at")
   .eq("teacher_id",teacherId).in("default_id",ids)
   .order("created_at",{ascending:false}).limit(2000);
  if(records.error)throw fail(500,"DATABASE_ERROR","Material default change history unavailable");
  history=records.data??[];
 }
 return {defaults,history,historyScope:"returned_defaults",studyLinksAreNotTeachingEvidence:true};
}
export async function teacherMaterialDefaultCreate(
 db:Db,teacherId:string,input:z.infer<typeof defaultCreateSchema>
){
 await ownedWorkplace(db,teacherId,input.workplaceId);
 if(input.groupId){
  const {data}=await db.from("class_groups").select("id")
   .eq("teacher_id",teacherId).eq("workplace_id",input.workplaceId)
   .eq("id",input.groupId).maybeSingle();
  if(!data)throw fail(404,"NOT_FOUND","Group not found in the selected workplace");
 }
 const row={teacher_id:teacherId,workplace_id:input.workplaceId,
  group_id:input.groupId??null,label:input.label,url:input.url,notes:input.notes,
  request_id:input.requestId};
 const {data,error}=await db.from("chess_material_defaults").insert(row)
  .select(fields).single();
 if(error?.code==="23505"){
  const {data:prior}=await db.from("chess_material_defaults").select(fields)
   .eq("teacher_id",teacherId).eq("request_id",input.requestId).maybeSingle();
  if(prior&&prior.workplace_id===row.workplace_id&&prior.group_id===row.group_id&&
    prior.label===row.label&&prior.url===row.url&&prior.notes===row.notes)
    return {...prior,replayed:true};
  throw fail(409,"CONFLICT","Study request ID was already used with different data");
 }
 if(error)throw fail(400,"VALIDATION_ERROR","Study default rejected");
 return {...data,replayed:false};
}
export async function teacherMaterialDefaultUpdate(
 db:Db,teacherId:string,input:z.infer<typeof defaultUpdateSchema>
){
 const changes:{label?:string;url?:string;notes?:string}={};
 if(input.label!==undefined)changes.label=input.label;
 if(input.url!==undefined)changes.url=input.url;
 if(input.notes!==undefined)changes.notes=input.notes;
 const {data,error}=await db.from("chess_material_defaults").update(changes)
  .eq("teacher_id",teacherId).eq("id",input.defaultId)
  .eq("updated_at",input.expectedUpdatedAt).is("archived_at",null)
  .select(fields).maybeSingle();
 if(error)throw fail(400,"VALIDATION_ERROR","Study default cannot be updated");
 if(!data){
  const {data:owned}=await db.from("chess_material_defaults").select("id")
   .eq("teacher_id",teacherId).eq("id",input.defaultId).maybeSingle();
  throw owned?fail(409,"CONFLICT","Study default changed; reload before editing"):
   fail(404,"NOT_FOUND","Study default not found");
 }
 return {ok:true,default:data};
}
export async function teacherMaterialDefaultArchive(
 db:Db,teacherId:string,input:z.infer<typeof defaultArchiveSchema>
){
 const {data,error}=await db.from("chess_material_defaults")
  .update({archived_at:new Date().toISOString()})
  .eq("teacher_id",teacherId).eq("id",input.defaultId)
  .eq("updated_at",input.expectedUpdatedAt).is("archived_at",null)
  .select(fields).maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Unable to archive study default");
 if(!data){
  const {data:owned}=await db.from("chess_material_defaults").select("id")
   .eq("teacher_id",teacherId).eq("id",input.defaultId).maybeSingle();
  throw owned?fail(409,"CONFLICT","Study default changed or already archived"):
    fail(404,"NOT_FOUND","Study default not found");
 }
 return {ok:true,default:data};
}
