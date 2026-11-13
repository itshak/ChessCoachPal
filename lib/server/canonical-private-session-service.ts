import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

const uuid=z.string().uuid();
export const canonicalPrivateSessionCreateSchema=z.object({
 studentId:uuid,
 workplaceId:uuid.nullable().optional(),
 date:z.string().date(),
 time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
 durationMinutes:z.number().int().min(15).max(480).optional(),
 isHomeVisit:z.boolean().default(false),
 makeupForSessionId:uuid.nullable().optional(),
 idempotencyKey:uuid,
}).strict();
export type CanonicalPrivateSessionCreateInput=
 z.input<typeof canonicalPrivateSessionCreateSchema>;

export class CanonicalPrivateSessionError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
 throw new CanonicalPrivateSessionError(status,code,message);
};

/** One canonical participant + teaching occurrence. A make-up points to the
 * original frozen participant and is granted only after SQL rechecks policy
 * and credit eligibility under the original session row lock.
 */
export async function canonicalPrivateSessionCreate(
 db:SupabaseClient,teacherId:string,raw:CanonicalPrivateSessionCreateInput
){
 void teacherId; // SQL auth.uid() controls the mutation.
 const parsed=canonicalPrivateSessionCreateSchema.safeParse(raw);
 if(!parsed.success)fail(400,"VALIDATION_ERROR","Invalid private session date, time or participant");
 const x=parsed.data!;
 const {data,error}=await db.rpc("ccp_canonical_private_session_create",{
  p_student_id:x.studentId,p_workplace_id:x.workplaceId??null,
  p_date:x.date,p_local_time:x.time,
  p_duration_minutes:x.durationMinutes??null,
  p_is_home_visit:x.isHomeVisit,
  p_makeup_for_session_id:x.makeupForSessionId??null,
  p_request_id:x.idempotencyKey,
 });
 if(error){
  const msg=error.message;
  if(/CANONICAL_PRIVATE_(?:REPLAY_CONFLICT)|CANONICAL_MAKEUP_ALREADY_USED|SESSION_CONFLICT/.test(msg)
   ||["23505","23P01","23514"].includes(error.code))
    fail(409,"CONFLICT","Session conflicts with existing teaching or a redeemed make-up");
  if(/CANONICAL_(?:PRIVATE_(?:STUDENT|WORKPLACE|ENROLLMENT)_NOT_FOUND|MAKEUP_(?:SOURCE|PARTICIPANT)_NOT_FOUND)/.test(msg)||
   error.code==="42501")
    fail(404,"NOT_FOUND","Student, workplace enrollment or make-up source not found");
  if(/CANONICAL_(?:PRIVATE_(?:INVALID|DST_GAP)|MAKEUP_NOT_ELIGIBLE)/.test(msg)||
   error.code==="22023")
    fail(400,"VALIDATION_ERROR","Invalid local session time or make-up eligibility");
  fail(500,"DATABASE_ERROR","Unable to schedule a canonical private session");
 }
 return data as {id:string;replayed:boolean;starts_at:string;
  duration_minutes:number;workplace_id:string;student_id:string};
}
