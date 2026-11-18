import type {SupabaseClient} from "@supabase/supabase-js";
import {createHash} from "node:crypto";
import {sendEmail} from "@/lib/email";
import {formatEventWhen} from "@/lib/events";
import {communicationCopy} from "@/lib/server/communication-locales";
import {isAppLocale,type AppLocale} from "@/i18n/locales";
import {oneToOne,type TeacherPolicy} from "@/lib/schedule";
import type {RsvpStatus} from "@/lib/supabase/types";

/** Event announcements are opt-in per explicit, scoped invitation.
 * Neither contact relationship nor group/student membership constitutes an
 * email recipient. Old household bearer tokens are never used or upgraded.
 */
export type EventEmailMode="invite"|"reminder";
type StudentRow={repertoire:string;sort_order:number;
  students:{id:string;name:string}|{id:string;name:string}[]|null};
type InvitedContact={id:string;display_name:string;email:string|null;
  preferred_locale:string|null;status:string};
type GrantRow={id:string;student_id:string;contact_id:string;
  revoked_at:string|null;expires_at:string;issued_at:string|null;permissions:string[];
  contacts:InvitedContact|InvitedContact[]|null};
type InvitationRow={id:string;status:RsvpStatus;revoked_at:string|null;
  portal_access_grants:GrantRow|GrantRow[]|null};
export type EventEmailRow={id:string;title:string;description:string;
  location:string;starts_at:string;ends_at:string|null;
  event_students:StudentRow[]|null;
  portal_event_invitations:InvitationRow[]|null};

export const EVENT_EMAIL_SELECT=`
  id,title,description,location,starts_at,ends_at,
  event_students(repertoire,sort_order,students(id,name)),
  portal_event_invitations(id,status,revoked_at,
    portal_access_grants(id,student_id,contact_id,revoked_at,expires_at,issued_at,permissions,
      contacts(id,display_name,email,preferred_locale,status)))
`;
export async function loadEventForEmail(db:SupabaseClient,eventId:string,
  teacherId?:string):Promise<EventEmailRow|null>{
  let q=db.from("events").select(EVENT_EMAIL_SELECT).eq("id",eventId);
  if(teacherId)q=q.eq("teacher_id",teacherId);
  const {data,error}=await q.maybeSingle();
  if(error)throw new Error("Unable to read scoped event invitations");
  return data as EventEmailRow|null;
}
type PreparedEmail={invitationId:string;grantId:string;
  to:string[];subject:string;text:string;locale:AppLocale};
function prepare(event:EventEmailRow,policy:TeacherPolicy,mode:EventEmailMode,
  now:Date=new Date()){
  const students=new Map<string,{name:string;repertoire:string}>();
  for(const member of event.event_students??[]){
    const student=oneToOne(member.students);
    if(student)students.set(student.id,{name:student.name,
      repertoire:member.repertoire?.trim()??""});
  }
  const messages:PreparedEmail[]=[];
  let skipped=0;
  for(const invitation of event.portal_event_invitations??[]){
    const grant=oneToOne(invitation.portal_access_grants);
    const contact=oneToOne(grant?.contacts??null);
    const student=grant?students.get(grant.student_id):null;
    if(invitation.revoked_at||!grant||grant.revoked_at||!grant.issued_at||
       new Date(grant.expires_at).getTime()<=now.getTime()||
       !grant.permissions.includes("event_rsvp")||
       !contact||contact.status!=="active"||!contact.email?.trim()||!student||
       (mode==="reminder"&&invitation.status==="no")){
      skipped++;continue;
    }
    const locale:AppLocale=isAppLocale(contact.preferred_locale)?contact.preferred_locale:"en";
    const copy=communicationCopy[locale].event;
    const when=formatEventWhen(event.starts_at,event.ends_at,policy.timezone,locale);
    const location=event.location?.trim()?`\n${copy.where}: ${event.location.trim()}`:"";
    const description=event.description?.trim()?`\n\n${event.description.trim()}`:"";
    const participation=`\n\n${copy.performing}:\n• ${student.name}`+
      (student.repertoire?` — ${student.repertoire}`:"");
    const subject=mode==="reminder"?copy.reminder(event.title):`${copy.invite(event.title)} — ${when}`;
    const intro=mode==="reminder"?copy.introReminder(event.title):copy.introInvite(event.title);
    const cta=mode==="reminder"?copy.reminderCta:copy.inviteCta;
    const text=`${copy.greeting(contact.display_name)}\n\n${intro}\n\n${copy.when}: ${when}${location}${description}${participation}\n\n${cta}\n\n${copy.signature(policy.business_name)}`;
    messages.push({invitationId:invitation.id,grantId:grant.id,
      to:[contact.email.trim()],subject,text,locale});
  }
  return {messages,skipped};
}
export function previewEventEmails(args:{event:EventEmailRow;policy:TeacherPolicy;
  mode:EventEmailMode;includeRecipients?:boolean}){
  const {messages,skipped}=prepare(args.event,args.policy,args.mode);
  return {draftCount:messages.length,skippedCount:skipped,
    recipientCount:messages.reduce((n,m)=>n+m.to.length,0),
    drafts:messages.map(m=>({subject:m.subject,text:m.text,locale:m.locale,
      recipientCount:m.to.length,portalLinkIncluded:false,
      ...(args.includeRecipients?{recipients:m.to}:{})}))};
}
export async function sendEventEmails(args:{db:SupabaseClient;teacherId:string;
  event:EventEmailRow;policy:TeacherPolicy;teacherEmail?:string|null;
  origin:string;mode:EventEmailMode}):Promise<{sent:number;skipped:number}>{
  // Never email a bearer link we cannot re-read: raw scoped portal tokens are
  // intentionally shown only once in the teacher's secure issuance flow.
  void args.origin;
  const {messages,skipped:initialSkipped}=prepare(args.event,args.policy,args.mode);
  let sent=0,skipped=initialSkipped;
  for(const message of messages){
    // Revalidate just before claiming an irreversible external side effect.
    const {data:grant,error:gError}=await args.db.from("portal_access_grants")
      .select("id,student_id,permissions,expires_at,issued_at,contacts!inner(email,status)")
      .eq("id",message.grantId)
      .eq("teacher_id",args.teacherId).is("revoked_at",null)
      .gt("expires_at",new Date().toISOString()).maybeSingle();
    const {data:invite,error:iError}=await args.db.from("portal_event_invitations")
      .select("id,status,portal_grant_id").eq("teacher_id",args.teacherId)
      .eq("event_id",args.event.id).eq("id",message.invitationId)
      .is("revoked_at",null).maybeSingle();
    const refreshedContact=grant?oneToOne(grant.contacts as
      {email:string|null;status:string}|{email:string|null;status:string}[]|null):null;
    if(gError||iError)throw new Error("Unable to revalidate event sharing permissions");
    if(!grant||!invite||!refreshedContact||!grant.issued_at||
      invite.portal_grant_id!==grant.id||
      !grant.permissions.includes("event_rsvp")||
      refreshedContact.status!=="active"||
      refreshedContact.email?.trim()!==message.to[0]||
      (args.mode==="reminder"&&invite.status==="no")){
      skipped++;continue;
    }
    const {data:roster,error:rosterError}=await args.db.from("event_students")
      .select("id").eq("event_id",args.event.id)
      .eq("student_id",grant.student_id).limit(1).maybeSingle();
    if(rosterError)throw new Error("Unable to verify invited student roster");
    if(!roster){skipped++;continue;}
    const bcc=args.policy.bcc_contact_emails&&args.policy.bcc_email?.trim()||undefined;
    const fromName=args.policy.business_name?
      `${args.policy.business_name} (via ChessCoachPal)`:undefined;
    const contentHash=createHash("sha256").update(JSON.stringify({
      to:message.to,bcc,subject:message.subject,text:message.text,
      locale:message.locale,replyTo:args.teacherEmail??null,fromName,
    })).digest("hex");
    const {data:receipt,error:claimError}=await args.db.from("event_email_deliveries")
      .insert({teacher_id:args.teacherId,event_id:args.event.id,
        portal_event_invitation_id:message.invitationId,mode:args.mode,
        content_hash:contentHash,status:"attempted"}).select("id").single();
    if(claimError?.code==="23505"){skipped++;continue;}
    if(claimError||!receipt)throw new Error("Event email reservation failed; nothing sent");
    const result=await sendEmail({to:message.to,bcc,subject:message.subject,
      text:message.text,locale:message.locale,fromName,
      replyTo:args.teacherEmail??undefined,
      idempotencyKey:`event/${args.event.id}/${message.invitationId}/${args.mode}/${contentHash}`});
    const {error:markError}=await args.db.from("event_email_deliveries")
      .update({status:result.sent?"sent":"failed",
        sent_at:result.sent?new Date().toISOString():null})
      .eq("teacher_id",args.teacherId).eq("id",receipt.id);
    if(markError)throw new Error("Event email receipt reconciliation unavailable");
    if(result.sent)sent++;else skipped++;
  }
  return {sent,skipped};
}
