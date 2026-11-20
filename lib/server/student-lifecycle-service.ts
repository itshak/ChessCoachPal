import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {CoachError} from "@/lib/server/coach-service";

const uuid=z.string().uuid();
export const lifecyclePreviewSchema=z.object({studentId:uuid}).strict();
export const lifecycleCommitSchema=z.object({
 studentId:uuid,mode:z.enum(["archive","reactivate"]),
 expectedUpdatedAt:z.string().min(10).max(80),
 selectedWorkplaceIds:z.array(uuid).max(50).default([]),
 requestId:uuid,reason:z.string().trim().min(8).max(1000),
 confirmed:z.literal(true),
}).strict().superRefine((input,ctx)=>{
 if(input.mode==="archive"&&input.selectedWorkplaceIds.length)
  ctx.addIssue({code:"custom",message:"Archiving may not select restored workplace IDs"});
 if(new Set(input.selectedWorkplaceIds).size!==input.selectedWorkplaceIds.length)
  ctx.addIssue({code:"custom",message:"Workplace IDs must not repeat"});
});
export type LifecycleCommitInput=z.infer<typeof lifecycleCommitSchema>;
type Db=SupabaseClient;
function fail(error:{code?:string}):never{
 if(error.code==="42501")throw new CoachError("NOT_FOUND",404,"Student or historical workplace was not found");
 if(error.code==="23505")throw new CoachError("CONFLICT",409,"Student was changed or lifecycle request ID was reused");
 if(error.code==="23503")throw new CoachError("CONFLICT",409,
  "Resolve group enrollments, future scheduled lessons and recurring slots before archiving");
 if(error.code==="22023")throw new CoachError("VALIDATION_ERROR",400,"A reviewed lifecycle request is required");
 if(error.code==="23514")throw new CoachError("CONFLICT",409,"Student lifecycle policy blocks the requested change");
 throw new CoachError("DATABASE_ERROR",500,"Student lifecycle transaction failed");
}

/** Identical teacher-owned transactional RPC for website and delegated MCP.
 * A preview is advisory; a commit rechecks every blocker inside SQL locks.
 */
export async function studentLifecyclePreview(db:Db,teacherId:string,input:{studentId:string}){
 void teacherId; // The SQL derives auth.uid() and refuses foreign students.
 const {data,error}=await db.rpc("ccp_student_lifecycle_preview",{
  p_student_id:input.studentId,
 });
 if(error)fail(error);
 return data;
}

export async function studentLifecycleCommit(db:Db,teacherId:string,input:LifecycleCommitInput){
 void teacherId;
 const args=lifecycleCommitSchema.parse(input);
 const {data,error}=await db.rpc("ccp_student_lifecycle_commit",{
  p_student_id:args.studentId,p_mode:args.mode,
  p_expected_updated_at:args.expectedUpdatedAt,
  p_selected_workplaces:args.selectedWorkplaceIds,
  p_request_id:args.requestId,p_reason:args.reason,p_confirmed:true,
 });
 if(error)fail(error);
 return data;
}
