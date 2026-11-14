import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {sendEmail,type SendEmailArgs} from "@/lib/email";
import {getPolicy} from "@/lib/server/scheduling";
import {familyEmailRecipients,familyGreetingNames,familyEmailBcc,
  type FamilyContact} from "@/lib/guardians";
import {formatLessonDate,formatLessonTime} from "@/lib/schedule";

type Db=SupabaseClient;
type Kind="session_note_family"|"session_cancel_family"|"portal_cancel_teacher";
type OutboxRow={
 id:string;teacher_id:string;session_id:string;student_id:string|null;
 event_key:string;kind:Kind;claim_token:string;attempts:number;
 payload:Record<string,unknown>;
};
type Outcome="sent"|"retry"|"cancelled";
type Delivery={outcome:Outcome;failureCode?:string;providerReceipt?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type FamilyRow=FamilyContact&{portal_token:string|null};

/** A failed send is never reported as success. Provider-side de-duplication
 * uses the persisted immutable outbox event key (Resend). For SMTP, a crash
 * after acceptance but before ACK can cause one retry; local SMTP is therefore
 * at-least-once rather than an unsupported exactly-once guarantee.
 */
export async function deliverCanonicalOutbox(
 db:Db,opts:{limit?:number;siteUrl?:string}={}
):Promise<{claimed:number;sent:number;retried:number;cancelled:number}>{
 const limit=opts.limit??10;
 if(!Number.isSafeInteger(limit)||limit<1||limit>30)
  throw new RangeError("Invalid outbox batch size");
 const {data,error}=await db.rpc("ccp_outbox_claim",{p_limit:limit});
 if(error)throw new Error("Unable to claim delivery intents: "+error.code);
 if(!Array.isArray(data))throw new Error("Invalid claim receipt");
 const stats={claimed:data.length,sent:0,retried:0,cancelled:0};
 for(const row of data as OutboxRow[]){
  let receipt:Delivery;
  try{receipt=await deliverOne(db,row,opts.siteUrl??process.env.NEXT_PUBLIC_SITE_URL??"");}
  catch(error){
   // Never log an email address, token, approved message, or private notes.
   console.error("Canonical outbox delivery unavailable:",error instanceof Error?error.name:"Error");
   receipt={outcome:"retry",failureCode:"delivery_unavailable"};
  }
  const {error:ackError}=await db.rpc("ccp_outbox_ack",{
   p_id:row.id,p_claim_token:row.claim_token,p_outcome:receipt.outcome,
   p_provider_receipt:receipt.providerReceipt??null,
   p_failure_code:receipt.failureCode??null,
  });
  if(ackError)throw new Error("Unable to acknowledge outbox lease: "+ackError.code);
  if(receipt.outcome==="sent")stats.sent++;
  if(receipt.outcome==="retry")stats.retried++;
  if(receipt.outcome==="cancelled")stats.cancelled++;
 }
 return stats;
}

async function deliverOne(db:Db,row:OutboxRow,siteUrl:string):Promise<Delivery>{
 if(!uuid.test(row.id)||!uuid.test(row.teacher_id)||
  !uuid.test(row.session_id)||!uuid.test(row.claim_token)||
  !["session_note_family","session_cancel_family","portal_cancel_teacher"].includes(row.kind))
  return {outcome:"cancelled",failureCode:"invalid_intent"};
 const {data:session,error:sessionError}=await db.from("teaching_sessions")
  .select("id,teacher_id,starts_at,student_id")
  .eq("id",row.session_id).eq("teacher_id",row.teacher_id).maybeSingle();
 if(sessionError)throw new Error("Session ownership lookup failed");
 if(!session)return {outcome:"cancelled",failureCode:"session_removed"};
 const {data:teacher,error:teacherError}=await db.from("teachers")
  .select("id,email,display_name").eq("id",row.teacher_id).maybeSingle();
 if(teacherError)throw new Error("Teacher lookup failed");
 if(!teacher)return {outcome:"cancelled",failureCode:"teacher_removed"};
 const policy=await getPolicy(db,row.teacher_id);
 const studio=policy.studio_name||teacher.display_name||"ChessCoachPal Studio";
 const when=formatLessonDate(session.starts_at,policy.timezone,"long")+
  " at "+formatLessonTime(session.starts_at,policy.timezone);
 const providerKey="ccp-outbox-"+row.event_key;

 if(row.kind==="portal_cancel_teacher"){
  if(!teacher.email)return {outcome:"cancelled",failureCode:"no_teacher_email"};
  const payload=row.payload;
  if(payload.sessionId!==row.session_id||payload.studentId!==row.student_id)
   return {outcome:"cancelled",failureCode:"invalid_payload"};
  const subject="Chess lesson cancelled by a student";
  const text="Student cancellation notice\n\n"+
    "Student: "+String(payload.studentName??"Student")+"\n"+
    "When: "+when+"\n"+
    (payload.cancelReason?"Reason: "+String(payload.cancelReason).slice(0,1000)+"\n":"")+
    "\nReview the attendance register in your ChessCoachPal schedule.";
  return sendApprovedEmail({
   to:teacher.email,subject,text,fromName:studio,
   idempotencyKey:providerKey,
  });
 }

 if(!row.student_id||!uuid.test(row.student_id))
  return {outcome:"cancelled",failureCode:"missing_participant"};
 const {data:participant,error:participantError}=await db.from("session_participants")
  .select("student_id").eq("teacher_id",row.teacher_id)
  .eq("session_id",row.session_id).eq("student_id",row.student_id).maybeSingle();
 if(participantError)throw new Error("Frozen roster lookup failed");
 if(!participant)return {outcome:"cancelled",failureCode:"participant_removed"};
 const {data:student,error:studentError}=await db.from("students")
  .select("id,name,guardian_id").eq("teacher_id",row.teacher_id)
  .eq("id",row.student_id).maybeSingle();
 if(studentError)throw new Error("Student lookup failed");
 if(!student?.guardian_id)return {outcome:"cancelled",failureCode:"no_family"};
 const {data:family,error:familyError}=await db.from("guardians")
  .select("id,teacher_id,name,email,secondary_name,secondary_email,email_recipients,portal_token")
  .eq("id",student.guardian_id).eq("teacher_id",row.teacher_id).maybeSingle();
 if(familyError)throw new Error("Family lookup failed");
 if(!family)return {outcome:"cancelled",failureCode:"family_removed"};
 const contacts=family as FamilyRow;
 const recipients=familyEmailRecipients(contacts);
 if(!recipients.length)return {outcome:"cancelled",failureCode:"no_family_email"};
 const base=siteUrl.trim().replace(/\/$/,"");
 const portalUrl=base&&contacts.portal_token&&/^https:\/\//.test(base)
  ?base+"/portal/"+encodeURIComponent(contacts.portal_token):undefined;
 let subject:string,text:string;
 if(row.kind==="session_note_family"){
  const requestedBody=row.payload.body;
  if(row.payload.approvedBy!==row.teacher_id||
    row.payload.sessionId!==row.session_id||
    row.payload.studentId!==row.student_id||
    typeof requestedBody!=="string"||!requestedBody.trim())
   return {outcome:"cancelled",failureCode:"invalid_note_approval"};
  // Re-verify current sharing consent. A teacher retracting or rewriting a
  // note before delivery must never send the stale approved message.
  const {data:note,error:noteError}=await db.from("session_notes")
   .select("id,body,shared_with_guardian")
   .eq("teacher_id",row.teacher_id).eq("session_id",row.session_id)
   .eq("student_id",row.student_id).maybeSingle();
  if(noteError)throw new Error("Note sharing check failed");
  if(!note?.shared_with_guardian||note.body!==requestedBody)
   return {outcome:"cancelled",failureCode:"note_not_shared_anymore"};
  subject="Chess lesson notes for "+student.name;
  text="Hi "+familyGreetingNames(contacts)+",\n\n"+
   "Here are the notes shared by "+studio+" for "+student.name+
   "'s chess lesson on "+when+":\n\n"+requestedBody+"\n\n"+
   "— "+studio+" (via ChessCoachPal)";
 }else if(row.kind==="session_cancel_family"){
  if(row.payload.sessionId!==row.session_id||
     row.payload.studentId!==row.student_id)
   return {outcome:"cancelled",failureCode:"invalid_cancel_approval"};
  // Prevent stale/out-of-order notifications if the teacher has since
  // corrected a cancelled attendance decision.
  const {data:mark,error:markError}=await db.from("session_attendance")
   .select("status").eq("teacher_id",row.teacher_id)
   .eq("session_id",row.session_id).eq("student_id",row.student_id).maybeSingle();
  if(markError)throw new Error("Cancellation state lookup failed");
  if(mark?.status!=="teacher_cancelled")
   return {outcome:"cancelled",failureCode:"cancellation_retracted"};
  const reason=String(row.payload.cancelReason??"").slice(0,1000);
  subject="Chess lesson cancelled — "+student.name;
  text="Hi "+familyGreetingNames(contacts)+",\n\n"+
   studio+" cancelled "+student.name+"'s chess lesson on "+when+
   (reason?"\n\nReason: "+reason:"")+
   "\n\nPlease review your family portal for the updated schedule.\n\n— "+studio;
 }else{
  return {outcome:"cancelled",failureCode:"unsupported_intent"};
 }
 return sendApprovedEmail({
  to:recipients,bcc:familyEmailBcc(policy),subject,text,
  fromName:studio+" (via ChessCoachPal)",
  replyTo:teacher.email??undefined,portalUrl,
  idempotencyKey:providerKey,
 });
}
async function sendApprovedEmail(args:SendEmailArgs):Promise<Delivery>{
 const result=await sendEmail(args);
 return result.sent?{outcome:"sent"}:
  {outcome:"retry",failureCode:"provider_unavailable"};
}
