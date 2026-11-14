import type {SupabaseClient} from "@supabase/supabase-js";

/** Guardian capability + frozen participant are checked atomically in SQL.
 * Never let a portal token authorize a teacher-scoped attendance RPC.
 */
export class CanonicalPortalError extends Error {
 constructor(public code:string,public status:number,message:string){super(message);}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function cancelCanonicalParticipant(
 serviceDb:SupabaseClient,token:string,sessionId:string,
 studentId:string,reason:string
){
 if(typeof token!=="string"||token.length<32||token.length>256||
   !uuid.test(sessionId)||!uuid.test(studentId))
  throw new CanonicalPortalError("NOT_FOUND",404,"Not found");
 if(typeof reason!=="string"||reason.length>1000)
  throw new CanonicalPortalError("VALIDATION_ERROR",400,"Cancellation note is too long");
 const {data,error}=await serviceDb.rpc("ccp_canonical_portal_cancel",{
  p_portal_token:token,p_session_id:sessionId,
  p_student_id:studentId,p_cancel_reason:reason.trim(),
 });
 if(error){
  if(error.message.includes("PORTAL_NOT_FOUND")||error.code==="42501")
    throw new CanonicalPortalError("NOT_FOUND",404,"Not found");
  if(error.message.includes("PORTAL_ALREADY_MARKED")||error.code==="23514")
    throw new CanonicalPortalError("CONFLICT",409,
      "This student already has an attendance decision");
  if(error.message.includes("PORTAL_TOO_LATE"))
    throw new CanonicalPortalError("PAST_SESSION",400,"Only upcoming sessions can be cancelled");
  if(error.message.includes("PORTAL_INVALID_NOTE")||error.code==="22023")
    throw new CanonicalPortalError("VALIDATION_ERROR",400,"Invalid cancellation note");
  throw new CanonicalPortalError("DATABASE_ERROR",503,"Cancellation unavailable");
 }
 if(!data?.ok||!data.noticeAt||!data.teacherId)
   throw new CanonicalPortalError("DATABASE_ERROR",503,"Cancellation unavailable");
 return {ok:true,noticeAt:data.noticeAt as string,
  replayed:Boolean(data.replayed),
  // The database saves notification intents/receipts; this is not a claim
  // that any external email has already been delivered.
  sessionId:data.sessionId as string,studentId:data.studentId as string,
 };
}
