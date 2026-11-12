import type {SupabaseClient} from "@supabase/supabase-js";

type Db=SupabaseClient;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SessionNoteError extends Error {
 constructor(public code:string,public status:number,message:string){super(message);}
}
export type SaveSessionNoteInput={
 studentId?:string|null;
 body:string;
 privateBody:string;
 sharedWithGuardian:boolean;
 sendEmail:boolean;
 confirmedEmail?:boolean;
 expectedUpdatedAt:string|null;
 idempotencyKey:string;
};

/** Validated identically by authenticated teacher website and delegated MCP. */
export function validateSessionNoteInput(input:SaveSessionNoteInput){
 if(!input||!uuid.test(input.idempotencyKey)||
   (input.studentId!==undefined&&input.studentId!==null&&!uuid.test(input.studentId))||
   typeof input.body!=="string"||input.body.length>10000||
   typeof input.privateBody!=="string"||input.privateBody.length>10000||
   typeof input.sharedWithGuardian!=="boolean"||
   typeof input.sendEmail!=="boolean"||
   (input.expectedUpdatedAt!==null&&
     (typeof input.expectedUpdatedAt!=="string"||
      !/^\d{4}-\d{2}-\d{2}T/.test(input.expectedUpdatedAt)||
      !Number.isFinite(Date.parse(input.expectedUpdatedAt)))))
  throw new SessionNoteError("VALIDATION_ERROR",400,"Invalid canonical session note");
 if(input.sendEmail&&(!input.confirmedEmail||!input.studentId||
   !input.sharedWithGuardian||!input.body.trim()))
  throw new SessionNoteError("CONFIRMATION_REQUIRED",400,
   "Explicit consent, a frozen participant and a shared note are required before queueing family email");
 return input;
}

export async function sessionNotesList(db:Db,teacherId:string,
 sessionId:string,opts:{includePrivate?:boolean;confirmed?:boolean}={}){
 if(!uuid.test(sessionId))throw new SessionNoteError("VALIDATION_ERROR",400,"Invalid session ID");
 if(opts.includePrivate&&!opts.confirmed)
  throw new SessionNoteError("CONFIRMATION_REQUIRED",400,
    "Confirm access to teacher-private notes");
 const {data:session,error:ownError}=await db.from("teaching_sessions")
  .select("id").eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
 if(ownError)throw new SessionNoteError("DATABASE_ERROR",500,"Session lookup failed");
 if(!session)throw new SessionNoteError("NOT_FOUND",404,"Teaching session not found");
 const {data,error}=await db.from("session_notes")
  .select("id,session_id,student_id,body,private_body,shared_with_guardian,emailed_at,created_at,updated_at")
  .eq("teacher_id",teacherId).eq("session_id",sessionId)
  .order("student_id",{ascending:true,nullsFirst:true});
 if(error)throw new SessionNoteError("DATABASE_ERROR",500,"Session notes unavailable");
 return (data??[]).map(row=>opts.includePrivate?row:{
  id:row.id,session_id:row.session_id,student_id:row.student_id,
  body:row.body,shared_with_guardian:row.shared_with_guardian,
  emailed_at:row.emailed_at,created_at:row.created_at,
  updated_at:row.updated_at,
 });
}

export async function sessionNoteSave(db:Db,teacherId:string,sessionId:string,
 input:SaveSessionNoteInput){
 void teacherId; // RLS + auth.uid() in the single SQL writer enforce tenant scope.
 if(!uuid.test(sessionId))throw new SessionNoteError("VALIDATION_ERROR",400,"Invalid session ID");
 validateSessionNoteInput(input);
 const {data,error}=await db.rpc("ccp_canonical_session_note_save",{
  p_session_id:sessionId,p_student_id:input.studentId??null,
  p_body:input.body,p_private_body:input.privateBody,
  p_share_with_guardian:input.sharedWithGuardian,
  p_send_email:input.sendEmail,
  p_expected_updated_at:input.expectedUpdatedAt,
  p_idempotency_key:input.idempotencyKey,
 });
 if(error){
  if(error.message.includes("SESSION_NOTE_NOT_FOUND")||
    error.message.includes("SESSION_NOTE_PARTICIPANT_NOT_FOUND")||
    error.code==="42501")
   throw new SessionNoteError("NOT_FOUND",404,"Session or participant not found");
  if(error.message.includes("SESSION_NOTE_REVISION_CONFLICT")||
    error.message.includes("SESSION_NOTE_REPLAY_CONFLICT")||error.code==="23505")
   throw new SessionNoteError("CONFLICT",409,"Session notes changed; refresh and retry");
  if(error.message.includes("SESSION_NOTE_INVALID_REQUEST")||error.code==="22023")
   throw new SessionNoteError("VALIDATION_ERROR",400,"Invalid session note");
  throw new SessionNoteError("DATABASE_ERROR",500,"Unable to save session note");
 }
 return data;
}
