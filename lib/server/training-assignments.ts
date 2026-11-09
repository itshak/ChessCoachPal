import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const uuid=z.string().uuid();
const date=z.iso.date();
export const assignmentListSchema=z.object({
  studentId:uuid,limit:z.number().int().min(1).max(100).default(30),
  offset:z.number().int().min(0).max(100000).default(0),
}).strict();
export const assignmentCreateSchema=z.object({
  studentIds:z.array(uuid).min(1).max(100).refine(a=>new Set(a).size===a.length,"Student IDs must be unique"),
  materialId:uuid,instructions:z.string().max(5000).default(""),
  dueOn:date.nullable().default(null),
  requestId:uuid,confirmed:z.literal(true),
}).strict();
export const assignmentAttemptSchema=z.object({
  assignmentId:uuid,outcome:z.enum(["in_progress","submitted","completed"]),
  note:z.string().max(5000).default(""),requestId:uuid,confirmed:z.literal(true),
}).strict();
export const assignmentReviewSchema=z.object({
  assignmentId:uuid,attemptId:uuid.nullable().default(null),
  verdict:z.enum(["reviewed","needs_work"]),
  feedback:z.string().max(5000).default(""),requestId:uuid,confirmed:z.literal(true),
}).strict();
export type AssignmentList=z.infer<typeof assignmentListSchema>;
export type AssignmentCreate=z.infer<typeof assignmentCreateSchema>;
export type AssignmentAttempt=z.infer<typeof assignmentAttemptSchema>;
export type AssignmentReview=z.infer<typeof assignmentReviewSchema>;
type Db=SupabaseClient;
export class AssignmentServiceError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(status:number,code:string,message:string)=>new AssignmentServiceError(status,code,message);
const select="id,student_id,material_id,instructions,due_on,created_at,updated_at,learning_materials(id,title,kind),assignment_attempts(id,outcome,note,source,recorded_at),assignment_reviews(id,verdict,feedback,reviewed_at,attempt_id)";

export async function teacherAssignmentsList(db:Db,teacherId:string,filter:AssignmentList){
  // Check student ownership before asking for assignments, even if empty.
  const {data:student,error:studentError}=await db.from("students").select("id")
    .eq("teacher_id",teacherId).eq("id",filter.studentId).maybeSingle();
  if(studentError)throw failure(500,"DATABASE_ERROR","Unable to look up student");
  if(!student)throw failure(404,"NOT_FOUND","Student not found");
  const {data,error,count}=await db.from("training_assignments")
    .select(select,{count:"exact"}).eq("teacher_id",teacherId).eq("student_id",filter.studentId)
    .order("created_at",{ascending:false}).order("id").range(filter.offset,filter.offset+filter.limit);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to read homework");
  return {assignments:(data??[]).slice(0,filter.limit),total:count??0,
    nextOffset:(data?.length??0)>filter.limit?filter.offset+filter.limit:null};
}
function interpretRpcError(error:{message:string},action:string):never {
  if(error.message.includes("IDEMPOTENCY_CONFLICT"))
    throw failure(409,"IDEMPOTENCY_CONFLICT","Request key was used with different content");
  if(/NOT_FOUND|ATTEMPT_MISMATCH/.test(error.message))
    throw failure(404,"NOT_FOUND","Student, material, assignment or attempt not accessible");
  if(/VALIDATION_ERROR|DUPLICATE_STUDENTS|23514/.test(error.message))
    throw failure(400,"VALIDATION_ERROR","Invalid "+action+" details");
  throw failure(500,"DATABASE_ERROR","Unable to save "+action);
}
export async function teacherAssignmentsCreate(db:Db,_teacherId:string,input:AssignmentCreate){
  const {data,error}=await db.rpc("ccp_assign_material",{
    p_student_ids:input.studentIds,p_material_id:input.materialId,
    p_instructions:input.instructions,p_due_on:input.dueOn,p_request_id:input.requestId,
  });
  if(error)interpretRpcError(error,"assignment");
  if(!data?.assignmentIds)throw failure(500,"DATABASE_ERROR","Assignment receipt unavailable");
  return data as {assignmentIds:string[];replayed:boolean;studentCount:number};
}
export async function teacherAssignmentAttempt(db:Db,_teacherId:string,input:AssignmentAttempt){
  const {data,error}=await db.rpc("ccp_assignment_record_attempt",{
    p_assignment_id:input.assignmentId,p_outcome:input.outcome,p_note:input.note,
    p_request_id:input.requestId,
  });
  if(error)interpretRpcError(error,"attempt");
  if(!data?.attemptId)throw failure(500,"DATABASE_ERROR","Attempt receipt unavailable");
  return data as {attemptId:string;replayed:boolean};
}
export async function teacherAssignmentReview(db:Db,_teacherId:string,input:AssignmentReview){
  const {data,error}=await db.rpc("ccp_assignment_record_review",{
    p_assignment_id:input.assignmentId,p_attempt_id:input.attemptId,
    p_verdict:input.verdict,p_feedback:input.feedback,p_request_id:input.requestId,
  });
  if(error)interpretRpcError(error,"review");
  if(!data?.reviewId)throw failure(500,"DATABASE_ERROR","Review receipt unavailable");
  return data as {reviewId:string;replayed:boolean};
}
