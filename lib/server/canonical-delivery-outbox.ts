import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {sendEmail,type SendEmailArgs} from "@/lib/email";
import {getPolicy} from "@/lib/server/scheduling";
import {localeDetails,isAppLocale,type AppLocale} from "@/i18n/locales";
import {communicationCopy} from "@/lib/server/communication-locales";

type Db=SupabaseClient;
type Kind="session_note_contacts"|"session_cancel_contacts"|"portal_cancel_teacher";
type OutboxRow={
 id:string;teacher_id:string;session_id:string;student_id:string|null;
 event_key:string;kind:Kind;claim_token:string;attempts:number;
 payload:Record<string,unknown>;
};
type Outcome="sent"|"retry"|"cancelled";
type Delivery={outcome:Outcome;failureCode?:string;providerReceipt?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ContactRow={id:string;display_name:string;email:string|null;
 preferred_locale:string|null;status:string};
type LinkedRecipient={contact_id:string;is_legal_guardian:boolean;
 may_receive_messages:boolean;active_from:string|null;active_to:string|null};

/** A failed send is never reported as success. Provider-side de-duplication
 * uses the persisted immutable outbox event key (Resend). For SMTP, a crash
 * after acceptance but before ACK can cause one retry; local SMTP is therefore
 * at-least-once rather than an unsupported exactly-once guarantee.
 */
export async function deliverCanonicalOutbox(
 db:Db,opts:{limit?:number}={}
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
  try{receipt=await deliverOne(db,row);}
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

async function deliverOne(db:Db,row:OutboxRow):Promise<Delivery>{
 if(!uuid.test(row.id)||!uuid.test(row.teacher_id)||
  !uuid.test(row.session_id)||!uuid.test(row.claim_token)||
  !["session_note_contacts","session_cancel_contacts","portal_cancel_teacher"].includes(row.kind))
  return {outcome:"cancelled",failureCode:"invalid_intent"};
 const {data:session,error:sessionError}=await db.from("teaching_sessions")
  .select("id,teacher_id,starts_at,student_id")
  .eq("id",row.session_id).eq("teacher_id",row.teacher_id).maybeSingle();
 if(sessionError)throw new Error("Session ownership lookup failed");
 if(!session)return {outcome:"cancelled",failureCode:"session_removed"};
 const {data:teacher,error:teacherError}=await db.from("teachers")
  .select("id,email,display_name,preferred_locale").eq("id",row.teacher_id).maybeSingle();
 if(teacherError)throw new Error("Teacher lookup failed");
 if(!teacher)return {outcome:"cancelled",failureCode:"teacher_removed"};
 const policy=await getPolicy(db,row.teacher_id);
 const studio=policy.business_name||teacher.display_name||"ChessCoachPal";
 const sessionWhen=(locale:AppLocale)=>new Intl.DateTimeFormat(localeDetails[locale].intl,{
   timeZone:policy.timezone,dateStyle:"full",timeStyle:"short"
  }).format(new Date(session.starts_at));
 const providerKey="ccp-outbox-"+row.event_key;

 if(row.kind==="portal_cancel_teacher"){
  if(!teacher.email)return {outcome:"cancelled",failureCode:"no_teacher_email"};
  const payload=row.payload;
  if(payload.sessionId!==row.session_id||payload.studentId!==row.student_id)
   return {outcome:"cancelled",failureCode:"invalid_payload"};
  const locale=isAppLocale(teacher.preferred_locale)?teacher.preferred_locale:"en";
  const copy=communicationCopy[locale].outbox;
  const subject=copy.studentCancelled;
  const text=copy.studentCancelNotice+"\n\n"+
    copy.student+": "+String(payload.studentName??copy.student)+"\n"+
    copy.when+": "+sessionWhen(locale)+"\n"+
    (payload.cancelReason?copy.reason+": "+String(payload.cancelReason).slice(0,1000)+"\n":"")+
    "\n"+copy.reviewAttendance;
  return sendApprovedEmail({
   to:teacher.email,subject,text,locale,fromName:studio,
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
  .select("id,name").eq("teacher_id",row.teacher_id)
  .eq("id",row.student_id).maybeSingle();
 if(studentError)throw new Error("Student lookup failed");
 if(!student)return {outcome:"cancelled",failureCode:"student_removed"};
 // A contact identity alone, the student roster, or a portal access grant
 // NEVER authorizes outbound sharing. The exact student↔contact relationship
 // must be active and explicitly marked as a permitted message recipient.
 const {data:links,error:linkError}=await db.from("student_contacts")
  .select("contact_id,is_legal_guardian,may_receive_messages,active_from,active_to")
  .eq("teacher_id",row.teacher_id).eq("student_id",row.student_id)
  .eq("may_receive_messages",true);
 if(linkError)throw new Error("Student contact consent lookup failed");
 const today=new Date().toISOString().slice(0,10);
 const allowed=(links??[] as LinkedRecipient[]).filter(x=>x.may_receive_messages&&(!x.active_from||x.active_from<=today)&&
   (!x.active_to||x.active_to>=today));
 const contactIds=[...new Set(allowed.map(x=>x.contact_id))];
 if(!contactIds.length)return {outcome:"cancelled",failureCode:"no_approved_contacts"};
 const {data:contacts,error:contactError}=await db.from("contacts")
  .select("id,display_name,email,preferred_locale,status")
  .eq("teacher_id",row.teacher_id).eq("status","active")
  .in("id",contactIds).order("id");
 if(contactError)throw new Error("Active contact lookup failed");
 const recipients=new Map<string,ContactRow>();
 for(const contact of contacts??[] as ContactRow[]){
  const email=contact.email?.trim();
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))continue;
  if(!recipients.has(email.toLowerCase()))recipients.set(email.toLowerCase(),contact);
 }
 if(!recipients.size)return {outcome:"cancelled",failureCode:"no_approved_contact_email"};
 // A student can have many separately legitimate contacts; a generic note
 // approval is NOT permission to broadcast to all of them. Until the note
 // editor captures an exact teacher-confirmed recipient ID and the outbox
 // persists a per-recipient delivery receipt, fail closed for ambiguity.
 // In particular an SMTP partial failure after delivering to contact A must
 // never cause a best-effort retry to duplicate A while sending to B.
 if(recipients.size!==1)
  return {outcome:"cancelled",failureCode:"explicit_contact_recipient_required"};
 const destinations=[...recipients.values()];
 for(const recipient of destinations){
  const locale=isAppLocale(recipient.preferred_locale)?recipient.preferred_locale:"en";
  const copy=communicationCopy[locale],when=sessionWhen(locale);
  const salutation=recipient.display_name;
 let subject:string,text:string;
 if(row.kind==="session_note_contacts"){
  const requestedBody=row.payload.body;
  if(row.payload.approvedBy!==row.teacher_id||
    row.payload.sessionId!==row.session_id||
    row.payload.studentId!==row.student_id||
    typeof requestedBody!=="string"||!requestedBody.trim())
   return {outcome:"cancelled",failureCode:"invalid_note_approval"};
  // Re-verify current sharing consent. A teacher retracting or rewriting a
  // note before delivery must never send the stale approved message.
  const {data:note,error:noteError}=await db.from("session_notes")
   .select("id,body,shared_with_contacts")
   .eq("teacher_id",row.teacher_id).eq("session_id",row.session_id)
   .eq("student_id",row.student_id).maybeSingle();
  if(noteError)throw new Error("Note sharing check failed");
  if(!note?.shared_with_contacts||note.body!==requestedBody)
   return {outcome:"cancelled",failureCode:"note_not_shared_anymore"};
  subject=copy.outbox.lessonNotes(student.name);
  text=copy.event.greeting(salutation)+"\n\n"+
   copy.outbox.lessonNotesIntro(studio,student.name,when)+"\n\n"+
   requestedBody+"\n\n"+copy.event.signature(studio);
 }else if(row.kind==="session_cancel_contacts"){
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
  subject=copy.outbox.lessonCancelled(student.name);
  text=copy.event.greeting(salutation)+"\n\n"+
   copy.outbox.lessonCancelIntro(studio,student.name,when)+
   (reason?"\n\n"+copy.outbox.reason+": "+reason:"")+
   "\n\n"+copy.outbox.reviewPortal+"\n\n"+copy.event.signature(studio);
 }else{
  return {outcome:"cancelled",failureCode:"unsupported_intent"};
 }
 // Recheck consent and the contact's current email immediately before
 // each irreversible external delivery, not only when this outbox was queued.
 const {data:currentLink,error:linkCheckError}=await db.from("student_contacts")
  .select("id,active_from,active_to").eq("teacher_id",row.teacher_id)
  .eq("student_id",row.student_id).eq("contact_id",recipient.id)
  .eq("may_receive_messages",true)
  .limit(1).maybeSingle();
 const {data:currentContact,error:contactCheckError}=await db.from("contacts")
  .select("email,status").eq("teacher_id",row.teacher_id)
  .eq("id",recipient.id).maybeSingle();
 if(linkCheckError||contactCheckError)
  throw new Error("Recipient permission could not be revalidated");
 if(!currentLink||!currentContact||currentContact.status!=="active"||
  (currentLink.active_from&&currentLink.active_from>today)||
  (currentLink.active_to&&currentLink.active_to<today)||
  currentContact.email?.trim().toLowerCase()!==recipient.email?.trim().toLowerCase()){
  continue;
 }
 const receipt=await sendApprovedEmail({
  to:recipient.email!.trim(),
  bcc:policy.bcc_contact_emails?policy.bcc_email??undefined:undefined,
  subject,text,locale,fromName:studio+" (via ChessCoachPal)",
  replyTo:teacher.email??undefined,
  idempotencyKey:providerKey+"-contact-"+recipient.id,
 });
 if(receipt.outcome!=="sent")return receipt;
 }
 return {outcome:"sent"};
}
async function sendApprovedEmail(args:SendEmailArgs):Promise<Delivery>{
 const result=await sendEmail(args);
 return result.sent?{outcome:"sent"}:
  {outcome:"retry",failureCode:"provider_unavailable"};
}
