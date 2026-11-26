import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {runOnlineRatingLease} from "./online-rating-worker";

/** Internal adapter only. This does not create a client, activate a cron, or
 * contact a chess provider. Callers must supply a server-side service client. */
type Authority = Pick<Parameters<typeof runOnlineRatingLease>[1], "claim" | "admit" | "finalize">;

export function onlineRatingWorkerAuthority(db:SupabaseClient):Authority{
 async function required(query:PromiseLike<{data:unknown;error:unknown}>){
  const {data,error}=await query;
  if(error)throw new Error("Online rating worker authority unavailable");
  return data;
 }
 return {
  async claim({teacherId,jobId}){
   // Trigger kind never changes in the canonical worker. Never consume a lease
   // attempt for a backfill candidate, even if an upstream scanner is wrong.
   const candidate=await required(db.from("student_rating_refresh_jobs").select("id")
    .eq("teacher_id",teacherId).eq("id",jobId)
    .in("trigger_kind",["profile_save","manual","scheduled"]).maybeSingle());
   if(candidate===null)return null;
   return required(db.rpc("ccp_rating_refresh_claim",{p_teacher_id:teacherId,p_job_id:jobId}));
  },
  async admit(lease){
   const result=await required(db.rpc("ccp_rating_refresh_admit",{
    p_teacher_id:lease.teacherId,p_job_id:lease.jobId,p_student_id:lease.studentId,
    p_provider:lease.provider,p_source_username:lease.sourceUsername,p_handle_revision:lease.handleRevision,
    p_input_digest:lease.inputDigest,p_trigger_kind:lease.triggerKind,p_attempt:lease.attempt,
    p_lease_token:lease.leaseToken,p_lease_until:lease.leaseUntil,
   }));
   return result===true;
  },
  finalize(attempt){
   return required(db.rpc("ccp_rating_refresh_finalize",attempt));
  },
 };
}
