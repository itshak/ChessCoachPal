import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CoachError } from "@/lib/server/coach-service";
import { normalizeLearningLink } from "@/lib/chess-learning";

type Db = SupabaseClient;
const missing = () => new CoachError("NOT_FOUND", 404, "Record not found");
const failed = () => new CoachError("DATABASE_ERROR", 500, "Learning operation failed");
const conflict = () => new CoachError("CONFLICT", 409, "Conflicting learning record");

type ObservationInput = {
  studentId: string; categoryId: string; sessionId?: string;
  observation: string; observedAt?: string; requestId?: string;
};
type ResourceInput = {
  studentId?: string; sessionId?: string; label: string; url: string;
  resourceType: "lichess_study" | "external"; requestId?: string;
};

async function checkContext(db: Db, teacherId: string, studentId?: string, sessionId?: string) {
  if (studentId) {
    const { data, error } = await db.from("students").select("id")
      .eq("teacher_id", teacherId).eq("id", studentId).is("archived_at", null).maybeSingle();
    if (error) throw failed();
    if (!data) throw missing();
  }
  if (sessionId) {
    const { data, error } = await db.from("teaching_sessions").select("id")
      .eq("teacher_id", teacherId).eq("id", sessionId).maybeSingle();
    if (error) throw failed();
    if (!data) throw missing();
    if (studentId) {
      const { data: member, error: memberError } = await db.from("session_participants")
        .select("student_id").eq("teacher_id", teacherId).eq("session_id", sessionId)
        .eq("student_id", studentId).maybeSingle();
      if (memberError) throw failed();
      if (!member) throw missing();
    }
  }
}

export async function chessCategoriesList(db: Db, teacherId: string) {
  const { data, error } = await db.from("chess_skill_categories")
    .select("id,name,description,sort_order").eq("teacher_id", teacherId)
    .order("sort_order").order("name").limit(200);
  if (error) throw failed();
  return data;
}

export async function chessCategoriesCreate(db: Db, teacherId: string,
  input: {name:string;description?:string;sortOrder?:number}) {
  const { data, error } = await db.from("chess_skill_categories").insert({
    teacher_id:teacherId, name:input.name, description:input.description ?? "",
    sort_order:input.sortOrder ?? 100,
  }).select("id,name,description,sort_order").single();
  if (error?.code === "23505") throw conflict();
  if (error) throw failed();
  return data;
}

export async function chessCategoriesUpdate(db: Db, teacherId: string,
  id: string, input: {name?:string;description?:string;sortOrder?:number}) {
  const changes: Record<string,unknown> = { updated_at:new Date().toISOString() };
  if (input.name !== undefined) changes.name = input.name;
  if (input.description !== undefined) changes.description = input.description;
  if (input.sortOrder !== undefined) changes.sort_order = input.sortOrder;
  const { data, error } = await db.from("chess_skill_categories").update(changes)
    .eq("id",id).eq("teacher_id",teacherId).select("id,name,description,sort_order").maybeSingle();
  if (error?.code === "23505") throw conflict();
  if (error) throw failed();
  if (!data) throw missing();
  return data;
}

export async function chessObservationsList(db: Db, teacherId: string,
  studentId: string, sessionId?: string) {
  await checkContext(db,teacherId,studentId,sessionId);
  let query = db.from("chess_observations")
    .select("id,student_id,session_id,category_id,observation,observed_at,source,verified_at,verified_by,created_at,updated_at")
    .eq("teacher_id",teacherId).eq("student_id",studentId)
    .order("observed_at",{ascending:false}).limit(200);
  if (sessionId) query = query.eq("session_id",sessionId);
  const {data,error} = await query;
  if (error) throw failed();
  return data;
}

export async function chessObservationsCreate(db: Db,teacherId:string,
  input:ObservationInput, source:"teacher"|"agent") {
  await checkContext(db,teacherId,input.studentId,input.sessionId);
  const {data:category,error:categoryError} = await db.from("chess_skill_categories")
    .select("id").eq("teacher_id",teacherId).eq("id",input.categoryId).maybeSingle();
  if (categoryError) throw failed();
  if (!category) throw missing();
  const now=new Date().toISOString();
  const row={
    teacher_id:teacherId, student_id:input.studentId, session_id:input.sessionId ?? null,
    category_id:input.categoryId, observation:input.observation,
    observed_at:input.observedAt ?? now, source,
    verified_at:source==="teacher"?now:null,
    verified_by:source==="teacher"?teacherId:null,
    request_id:input.requestId ?? null,
  };
  const fields="id,student_id,session_id,category_id,observation,observed_at,source,verified_at,verified_by";
  const {data,error}=await db.from("chess_observations").insert(row).select(fields).single();
  if (error?.code==="23505" && input.requestId) {
    const {data:old}=await db.from("chess_observations").select(fields)
      .eq("teacher_id",teacherId).eq("request_id",input.requestId).maybeSingle();
    if (old && old.student_id===row.student_id && old.session_id===row.session_id &&
        old.category_id===row.category_id && old.observation===row.observation &&
        old.source===row.source && (!input.observedAt ||
          new Date(old.observed_at).getTime()===new Date(input.observedAt).getTime())) return old;
    throw conflict();
  }
  if (error?.code==="23503" || error?.code==="23514") throw missing();
  if (error) throw failed();
  return data;
}

export async function chessObservationsUpdate(db:Db,teacherId:string,id:string,
  input:{observation?:string;categoryId?:string;observedAt?:string}) {
  const {data:old,error:readError}=await db.from("chess_observations")
    .select("id,student_id,category_id").eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if (readError) throw failed();
  if (!old) throw missing();
  if (input.categoryId) {
    const {data:category}=await db.from("chess_skill_categories").select("id")
      .eq("teacher_id",teacherId).eq("id",input.categoryId).maybeSingle();
    if (!category) throw missing();
  }
  const changes:Record<string,unknown>={updated_at:new Date().toISOString()};
  if (input.observation!==undefined) changes.observation=input.observation;
  if (input.categoryId!==undefined) changes.category_id=input.categoryId;
  if (input.observedAt!==undefined) changes.observed_at=input.observedAt;
  const {data,error}=await db.from("chess_observations").update(changes)
    .eq("teacher_id",teacherId).eq("id",id)
    .select("id,student_id,session_id,category_id,observation,observed_at,source,verified_at,verified_by").maybeSingle();
  if (error) throw failed();
  if (!data) throw missing();
  return data;
}

/** Sensitive provenance: only the teacher-owned browser action may approve agent observations. MCP may propose or correct, but must never self-verify. */
export async function chessObservationsApprove(db:Db,teacherId:string,id:string) {
  const {data,error}=await db.from("chess_observations").update({
    verified_at:new Date().toISOString(),verified_by:teacherId,updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",id).eq("source","agent")
    .is("verified_at",null)
    .select("id,student_id,session_id,category_id,observation,observed_at,source,verified_at,verified_by").maybeSingle();
  if (error) throw failed();
  if (!data) throw missing();
  return data;
}

export async function chessResourcesList(db:Db,teacherId:string,
  input:{studentId?:string;sessionId?:string}) {
  if (!input.studentId && !input.sessionId)
    throw new CoachError("VALIDATION_ERROR",400,"Choose a student or session");
  await checkContext(db,teacherId,input.studentId,input.sessionId);
  let query=db.from("chess_learning_resources")
    .select("id,student_id,session_id,label,url,resource_type,provider_study_id,provider_chapter_id,created_at,updated_at")
    .eq("teacher_id",teacherId).order("created_at",{ascending:false}).limit(200);
  if (input.studentId && input.sessionId) {
    query=query.or("student_id.eq."+input.studentId+",session_id.eq."+input.sessionId);
  } else if (input.studentId) query=query.eq("student_id",input.studentId);
  else query=query.eq("session_id",input.sessionId!);
  const {data,error}=await query;
  if (error) throw failed();
  return data;
}

export async function chessResourcesCreate(db:Db,teacherId:string,input:ResourceInput) {
  if (!input.studentId && !input.sessionId)
    throw new CoachError("VALIDATION_ERROR",400,"Choose a student or session");
  await checkContext(db,teacherId,input.studentId,input.sessionId);
  let normalized:ReturnType<typeof normalizeLearningLink>;
  try {normalized=normalizeLearningLink(input.url,input.resourceType);}
  catch(error) {throw new CoachError("VALIDATION_ERROR",400,error instanceof Error?error.message:"Invalid learning link");}
  const row={
    teacher_id:teacherId,student_id:input.studentId??null,session_id:input.sessionId??null,
    label:input.label,url:normalized.url,resource_type:normalized.resourceType,
    provider_study_id:normalized.providerStudyId,provider_chapter_id:normalized.providerChapterId,
    request_id:input.requestId??null,
  };
  const fields="id,student_id,session_id,label,url,resource_type,provider_study_id,provider_chapter_id";
  const {data,error}=await db.from("chess_learning_resources").insert(row).select(fields).single();
  if (error?.code==="23505" && input.requestId) {
    const {data:old}=await db.from("chess_learning_resources").select(fields)
      .eq("teacher_id",teacherId).eq("request_id",input.requestId).maybeSingle();
    if (old && old.student_id===row.student_id && old.session_id===row.session_id &&
        old.label===row.label && old.url===row.url &&
        old.resource_type===row.resource_type) return old;
    throw conflict();
  }
  if (error?.code==="23503" || error?.code==="23514") throw missing();
  if (error) throw failed();
  return data;
}

export async function chessResourcesUpdate(db:Db,teacherId:string,id:string,
  input:{label?:string;url?:string;resourceType?:"lichess_study"|"external"}) {
  const {data:old,error:readError}=await db.from("chess_learning_resources")
    .select("label,url,resource_type").eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if (readError) throw failed();
  if (!old) throw missing();
  let normalized:ReturnType<typeof normalizeLearningLink>;
  try {normalized=normalizeLearningLink(input.url??old.url,input.resourceType??old.resource_type);}
  catch(error) {throw new CoachError("VALIDATION_ERROR",400,error instanceof Error?error.message:"Invalid learning link");}
  const {data,error}=await db.from("chess_learning_resources").update({
    label:input.label??old.label,url:normalized.url,resource_type:normalized.resourceType,
    provider_study_id:normalized.providerStudyId,provider_chapter_id:normalized.providerChapterId,
    updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",id)
    .select("id,student_id,session_id,label,url,resource_type,provider_study_id,provider_chapter_id").maybeSingle();
  if (error) throw failed();
  if (!data) throw missing();
  return data;
}
