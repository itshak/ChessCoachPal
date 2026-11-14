import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

const uuid=z.string().uuid();
export const coachGoalSchema=z.object({
  id:uuid,
  title:z.string().trim().min(1).max(160),
  status:z.enum(["planned","in_progress","achieved","abandoned"]).default("planned"),
  targetDate:z.iso.date().nullable().default(null),
  coachEvidence:z.string().trim().max(1500).nullable().default(null),
}).strict().superRefine((goal,ctx)=>{
  if(goal.status==="achieved"&&(goal.coachEvidence??"").trim().length<10)
    ctx.addIssue({code:"custom",message:"An achieved goal needs explicit coach evidence",path:["coachEvidence"]});
});
export const trainingPlanCommitSchema=z.object({
  planId:uuid.optional(),expectedRevision:z.number().int().min(1).optional(),
  studentId:uuid,title:z.string().trim().min(1).max(160),
  summary:z.string().max(2500).default(""),
  status:z.enum(["draft","active","paused","completed","archived"]).default("draft"),
  goals:z.array(coachGoalSchema).max(20).default([]),
  requestId:uuid,confirmed:z.literal(true),
}).strict().superRefine((plan,ctx)=>{
  if(Boolean(plan.planId)!==Boolean(plan.expectedRevision))
    ctx.addIssue({code:"custom",message:"Edits require a plan ID and expected revision",path:["expectedRevision"]});
  const ids=plan.goals.map(g=>g.id);
  if(new Set(ids).size!==ids.length)
    ctx.addIssue({code:"custom",message:"Duplicate goal IDs are forbidden",path:["goals"]});
  if(plan.status==="completed"&&plan.goals.some(g=>g.status==="planned"||g.status==="in_progress"))
    ctx.addIssue({code:"custom",message:"All goals need coach decisions before completing a plan",path:["status"]});
});
export const trainingPlanListSchema=z.object({
  studentId:uuid,
  includeArchived:z.boolean().default(false),
  limit:z.number().int().min(1).max(100).default(30),
  offset:z.number().int().min(0).max(100000).default(0),
}).strict();
export const trainingPlanGetSchema=z.object({planId:uuid}).strict();

export type TrainingPlanCommit=z.infer<typeof trainingPlanCommitSchema>;
export type TrainingPlanList=z.infer<typeof trainingPlanListSchema>;
export class TrainingPlanError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new TrainingPlanError(status,code,message);
type Db=SupabaseClient;

export async function teacherTrainingPlansList(db:Db,teacherId:string,filters:TrainingPlanList){
  const {data:owned,error:ownerError}=await db.from("students").select("id")
    .eq("teacher_id",teacherId).eq("id",filters.studentId).maybeSingle();
  if(ownerError)throw fail(500,"DATABASE_ERROR","Student ownership lookup failed");
  if(!owned)throw fail(404,"NOT_FOUND","Student not found");
  let query=db.from("student_training_plans")
    .select("id,student_id,title,summary,status,goals,revision,created_at,updated_at",{count:"exact"})
    .eq("teacher_id",teacherId).eq("student_id",filters.studentId)
    .order("updated_at",{ascending:false}).order("id")
    .range(filters.offset,filters.offset+filters.limit);
  if(!filters.includeArchived)query=query.neq("status","archived");
  const {data,error,count}=await query;
  if(error)throw fail(500,"DATABASE_ERROR","Student plans unavailable");
  const rows=(data??[]).slice(0,filters.limit);
  return {studentId:filters.studentId,plans:rows,total:count??0,
    nextOffset:(data?.length??0)>filters.limit?filters.offset+filters.limit:null,
    truthBasis:"explicit_teacher_goal_decisions_only"};
}
export async function teacherTrainingPlanGet(db:Db,teacherId:string,planId:string){
  const {data,error}=await db.from("student_training_plans")
    .select("id,student_id,title,summary,status,goals,revision,created_at,updated_at")
    .eq("teacher_id",teacherId).eq("id",planId).maybeSingle();
  if(error)throw fail(500,"DATABASE_ERROR","Training plan unavailable");
  if(!data)throw fail(404,"NOT_FOUND","Training plan not found");
  const revisions=await db.from("student_training_plan_revisions")
    .select("revision,snapshot,changed_at")
    .eq("teacher_id",teacherId).eq("plan_id",planId)
    .order("revision",{ascending:false}).limit(100);
  if(revisions.error)throw fail(500,"DATABASE_ERROR","Goal audit history unavailable");
  return {plan:data,revisions:revisions.data??[],
    truthBasis:"explicit_teacher_goal_decisions_only"};
}
/** One teacher-owned RPC handles both initial plan creation and subsequent
 * audited revisions. Retried client calls cannot duplicate work or fabricate
 * achieved learning: each decision is explicit and stored in a snapshot. */
export async function teacherTrainingPlanCommit(db:Db,teacherId:string,input:TrainingPlanCommit){
  const {data,error}=await db.rpc("ccp_student_training_plan_commit",{
    p_plan_id:input.planId??null,p_expected_revision:input.expectedRevision??null,
    p_student_id:input.studentId,p_title:input.title,p_summary:input.summary,
    p_status:input.status,p_goals:input.goals,p_request_id:input.requestId,
  });
  if(error){
    if(/IDEMPOTENCY_CONFLICT/.test(error.message))
      throw fail(409,"IDEMPOTENCY_CONFLICT","Request ID already belongs to a different plan change");
    if(/STALE_REVISION/.test(error.message))
      throw fail(409,"STALE_REVISION","The training plan has changed; refresh first");
    if(/STUDENT_ARCHIVED/.test(error.message))
      throw fail(409,"STUDENT_ARCHIVED","Reactivate the student before creating training plans");
    if(/DUPLICATE_GOAL|INCOMPLETE_GOALS|VALIDATION_ERROR|23514/.test(error.message))
      throw fail(400,"VALIDATION_ERROR","Plan and goals need valid explicit coach decisions");
    if(/NOT_FOUND/.test(error.message))
      throw fail(404,"NOT_FOUND","Student or plan not found");
    throw fail(500,"DATABASE_ERROR","Unable to commit training plan");
  }
  if(!data||typeof data!=="object"||typeof data.planId!=="string"||
    typeof data.revision!=="number"||typeof data.replayed!=="boolean")
    throw fail(500,"DATABASE_ERROR","Invalid plan commit receipt");
  return {receipt:data,plan:(await teacherTrainingPlanGet(db,teacherId,data.planId)).plan};
}
