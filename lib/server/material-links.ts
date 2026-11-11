import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CoachError } from "@/lib/server/coach-service";
import type { z } from "zod";
import {
 materialLinkListInput,materialLinkCreateInput,materialLinkUpdateInput,materialLinkUnlinkInput,
} from "@/lib/chess-learning";

type Db=SupabaseClient;
const fail=(code:string,status:number,message:string)=>new CoachError(code,status,message);
const missing=()=>fail("NOT_FOUND",404,"Material, student, session or link not found");
const fields="id,material_id,student_id,session_id,revision,created_at,updated_at,learning_materials(title,kind,source_url)";

async function scope(db:Db,teacherId:string,studentId?:string,sessionId?:string){
 if(!studentId&&!sessionId)throw fail("VALIDATION_ERROR",400,"Choose a student or session");
 if(studentId){
  const {data,error}=await db.from("students").select("id,archived_at")
   .eq("teacher_id",teacherId).eq("id",studentId).maybeSingle();
  if(error)throw fail("DATABASE_ERROR",500,"Unable to verify student");
  if(!data)throw missing();
  if(data.archived_at)throw fail("CONFLICT",409,"Archived students cannot receive new material links");
 }
 if(sessionId){
  const {data,error}=await db.from("teaching_sessions").select("id")
   .eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
  if(error)throw fail("DATABASE_ERROR",500,"Unable to verify session");
  if(!data)throw missing();
  if(studentId){
   const {data:member,error:memberError}=await db.from("session_participants").select("student_id")
    .eq("teacher_id",teacherId).eq("session_id",sessionId)
    .eq("student_id",studentId).maybeSingle();
   if(memberError)throw fail("DATABASE_ERROR",500,"Unable to verify lesson roster");
   if(!member)throw missing();
  }
 }
}
async function ownedMaterial(db:Db,teacherId:string,materialId:string){
 const {data,error}=await db.from("learning_materials").select("id,archived_at")
  .eq("teacher_id",teacherId).eq("id",materialId).maybeSingle();
 if(error)throw fail("DATABASE_ERROR",500,"Unable to verify material");
 if(!data)throw missing();
 if(data.archived_at)throw fail("CONFLICT",409,"Restore this material before linking it");
}

export async function materialLinksList(db:Db,teacherId:string,input:z.infer<typeof materialLinkListInput>){
 if(!input.studentId&&!input.sessionId)throw fail("VALIDATION_ERROR",400,"Choose a student or session");
 // Archived students remain readable for historical associations.
 for(const [table,id] of [["students",input.studentId],["teaching_sessions",input.sessionId]] as const){
  if(!id)continue;
  const {data,error}=await db.from(table).select("id").eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)throw fail("DATABASE_ERROR",500,"Unable to verify material link scope");
  if(!data)throw missing();
 }
 let query=db.from("material_links").select(fields,{count:"exact"})
  .eq("teacher_id",teacherId).order("created_at",{ascending:false}).order("id")
  .range(input.offset,input.offset+input.limit);
 if(input.studentId&&input.sessionId)query=query.or("student_id.eq."+input.studentId+",session_id.eq."+input.sessionId);
 else if(input.studentId)query=query.eq("student_id",input.studentId);
 else query=query.eq("session_id",input.sessionId!);
 const {data,error,count}=await query;
 if(error)throw fail("DATABASE_ERROR",500,"Unable to list material links");
 return {links:(data??[]).slice(0,input.limit),total:count??0,
  nextOffset:(data?.length??0)>input.limit?input.offset+input.limit:null};
}

export async function materialLinksCreate(db:Db,teacherId:string,input:z.infer<typeof materialLinkCreateInput>){
 await scope(db,teacherId,input.studentId,input.sessionId);
 await ownedMaterial(db,teacherId,input.materialId);
 const row={teacher_id:teacherId,student_id:input.studentId??null,session_id:input.sessionId??null,
  material_id:input.materialId,request_id:input.requestId};
 const {data,error}=await db.from("material_links").insert(row).select(fields).single();
 if(error?.code==="23505"){
  const {data:old,error:lookup}=await db.from("material_links")
   .select(fields+",request_id").eq("teacher_id",teacherId).eq("request_id",input.requestId).maybeSingle();
  if(lookup)throw fail("DATABASE_ERROR",500,"Unable to verify retry");
  if(old&&old.material_id===row.material_id&&old.student_id===row.student_id&&old.session_id===row.session_id)
   return {link:old,replayed:true};
  throw fail("IDEMPOTENCY_CONFLICT",409,"Request ID already belongs to a different material link");
 }
 if(error?.code==="23503"||error?.code==="23514")throw missing();
 if(error)throw fail("DATABASE_ERROR",500,"Unable to attach material");
 if(!data)throw fail("DATABASE_ERROR",500,"Missing link receipt");
 return {link:data,replayed:false};
}

export async function materialLinksUpdate(db:Db,teacherId:string,input:z.infer<typeof materialLinkUpdateInput>){
 await ownedMaterial(db,teacherId,input.materialId);
 const {data,error}=await db.from("material_links").update({material_id:input.materialId})
  .eq("id",input.linkId).eq("teacher_id",teacherId).eq("revision",input.expectedRevision)
  .select(fields).maybeSingle();
 if(error?.code==="23503")throw missing();
 if(error)throw fail("DATABASE_ERROR",500,"Unable to change material association");
 if(!data){
  const {data:owned}=await db.from("material_links").select("id")
   .eq("id",input.linkId).eq("teacher_id",teacherId).maybeSingle();
  throw owned?fail("CONFLICT",409,"Link revision changed; reload before editing"):missing();
 }
 return {link:data};
}
export async function materialLinksUnlinkImpact(db:Db,teacherId:string,linkId:string){
 const {data:link,error}=await db.from("material_links").select("id,material_id,revision,learning_materials(title)")
  .eq("teacher_id",teacherId).eq("id",linkId).maybeSingle();
 if(error)throw fail("DATABASE_ERROR",500,"Unable to inspect material link");
 if(!link)throw missing();
 return {linkId,materialId:link.material_id,revision:link.revision,canUnlink:true,
  evidencePreserved:true,
  explanation:"Removing an association never deletes a typed material or any teacher-attested teaching evidence"};
}
export async function materialLinksUnlink(db:Db,teacherId:string,input:z.infer<typeof materialLinkUnlinkInput>){
 const {data,error}=await db.from("material_links").delete()
  .eq("teacher_id",teacherId).eq("id",input.linkId).eq("revision",input.expectedRevision)
  .select("id").maybeSingle();
 if(error?.code==="23503")throw fail("CONFLICT",409,"Link is referenced by a roster record");
 if(error)throw fail("DATABASE_ERROR",500,"Unable to unlink material");
 if(!data){
  const {data:owned}=await db.from("material_links").select("id")
   .eq("teacher_id",teacherId).eq("id",input.linkId).maybeSingle();
  throw owned?fail("CONFLICT",409,"Link revision changed; reload the link"):missing();
 }
 return {unlinked:true,linkId:input.linkId,evidencePreserved:true};
}
