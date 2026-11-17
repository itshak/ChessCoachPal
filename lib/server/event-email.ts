import type { SupabaseClient } from "@supabase/supabase-js";
import {createHash} from "node:crypto";
import { sendEmail } from "@/lib/email";
import { formatEventWhen } from "@/lib/events";
import {communicationCopy,familyCommunicationLocale} from "@/lib/server/communication-locales";
import type {AppLocale} from "@/i18n/locales";
import {
  familyEmailRecipients,
  familyGreetingNames,
  familyEmailBcc,
  type FamilyContact,
} from "@/lib/guardians";
import { oneToOne, type StudioPolicy } from "@/lib/schedule";
import type { RsvpStatus } from "@/lib/supabase/types";

export type EventEmailMode = "invite" | "reminder";

type StudentRow = {
  repertoire: string;
  sort_order: number;
  students:
    | { id: string; name: string; guardian_id: string | null }
    | { id: string; name: string; guardian_id: string | null }[]
    | null;
};

type RsvpRow = {
  guardian_id: string;
  status: RsvpStatus;
  guardians:
    | (FamilyContact & { id: string; portal_token: string | null })
    | (FamilyContact & { id: string; portal_token: string | null })[]
    | null;
};

export type EventEmailRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  event_students: StudentRow[] | null;
  event_rsvps: RsvpRow[] | null;
};

const EVENT_EMAIL_SELECT = `
  id, title, description, location, starts_at, ends_at,
  event_students (
    repertoire, sort_order,
    students ( id, name, guardian_id )
  ),
  event_rsvps (
    guardian_id, status,
    guardians (
      id, name, email, secondary_name, secondary_email,
      email_recipients, preferred_locale, portal_token
    )
  )
`;

export async function loadEventForEmail(
  supabase: SupabaseClient,
  eventId: string,
  teacherId?: string
): Promise<EventEmailRow | null> {
  let query = supabase
    .from("events")
    .select(EVENT_EMAIL_SELECT)
    .eq("id", eventId);

  if (teacherId) {
    query = query.eq("teacher_id", teacherId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("event email load:", error);
    return null;
  }
  return data as EventEmailRow | null;
}

/**
 * Email invited families about an event (manual invite or day-before reminder).
 * Reminder mode skips RSVP = no.
 */
type PreparedEmail = {
  guardianId:string;to:string[];subject:string;text:string;portalToken:string|null;locale:AppLocale;
};
/**
 * Prepare exactly the same messages used by the real send path.
 * An MCP or website preview never returns the portalToken.
 */
function prepareEventEmails(event:EventEmailRow,policy:StudioPolicy,mode:EventEmailMode){
  const performersByGuardian=new Map<string,{name:string;repertoire:string}[]>();
  for(const row of event.event_students??[]){
    const student=oneToOne(row.students);
    if(!student?.guardian_id)continue;
    const list=performersByGuardian.get(student.guardian_id)??[];
    list.push({name:student.name,repertoire:row.repertoire?.trim()??""});
    performersByGuardian.set(student.guardian_id,list);
  }
  const messages:PreparedEmail[]=[];
  let skipped=0;
  for(const rsvp of event.event_rsvps??[]){
    if(mode==="reminder"&&rsvp.status==="no"){skipped++;continue;}
    const family=oneToOne(rsvp.guardians);
    if(!family){skipped++;continue;}
    const recipients=familyEmailRecipients(family);
    if(recipients.length===0){skipped++;continue;}
    const locale=familyCommunicationLocale(family),copy=communicationCopy[locale].event;
    const when=formatEventWhen(event.starts_at,event.ends_at,policy.timezone,locale);
    const kids=performersByGuardian.get(rsvp.guardian_id)??[];
    const repertoireLines=kids.length===0?"":`\n\n${copy.performing}:\n`+kids.map(k=>
      k.repertoire?`• ${k.name} — ${k.repertoire}`:`• ${k.name}`).join("\n");
    const locationLine=event.location?.trim()?`\n${copy.where}: ${event.location.trim()}`:"";
    const descriptionLine=event.description?.trim()?`\n\n${event.description.trim()}`:"";
    const subject=mode==="reminder"
      ?copy.reminder(event.title):`${copy.invite(event.title)} — ${when}`;
    const intro=mode==="reminder"
      ?copy.introReminder(event.title):copy.introInvite(event.title);
    const cta=mode==="reminder"?copy.reminderCta:copy.inviteCta;
    const text=`${copy.greeting(familyGreetingNames(family,locale))}\n\n${intro}\n\n${copy.when}: ${when}${locationLine}${descriptionLine}${repertoireLines}\n\n${cta}\n\n${copy.signature(policy.studio_name)}`;
    messages.push({guardianId:rsvp.guardian_id,to:recipients,subject,text,portalToken:family.portal_token,locale});
  }
  return {messages,skipped};
}
/** Non-mutating, same-template preview. No bearer-visible portal links or credentials. */
export function previewEventEmails(args:{
 event:EventEmailRow;policy:StudioPolicy;mode:EventEmailMode;includeRecipients?:boolean;
}){
  const {messages,skipped}=prepareEventEmails(args.event,args.policy,args.mode);
  return {
    draftCount:messages.length,skippedCount:skipped,
    recipientCount:messages.reduce((n,m)=>n+m.to.length,0),
    drafts:messages.map(m=>({
      subject:m.subject,text:m.text,locale:m.locale,recipientCount:m.to.length,
      portalLinkIncluded:Boolean(m.portalToken),
      ...(args.includeRecipients?{recipients:m.to}:{}),
    })),
  };
}
export async function sendEventEmails(args:{
  db:SupabaseClient;teacherId:string;
  event:EventEmailRow;policy:StudioPolicy;teacherEmail?:string|null;
  origin:string;mode:EventEmailMode;
}):Promise<{sent:number;skipped:number}>{
  const {messages,skipped:initialSkipped}=prepareEventEmails(args.event,args.policy,args.mode);
  const origin=args.origin.replace(/\/$/,"");
  let sent=0,skipped=initialSkipped;
  for(const message of messages){
    const portalUrl=message.portalToken?`${origin}/portal/${message.portalToken}`:undefined;
    const bcc=familyEmailBcc(args.policy);
    const fromName=args.policy.studio_name
      ?`${args.policy.studio_name} (via ChessCoachPal)`:undefined;
    const contentHash=createHash("sha256").update(JSON.stringify({
      to:message.to,bcc,subject:message.subject,text:message.text,locale:message.locale,
      portalUrl,replyTo:args.teacherEmail??null,fromName,
    })).digest("hex");
    // Unique receipt is the atomic cross-process send claim. If it already
    // exists (including ambiguous attempted/failed sends), never retry
    // automatically: avoid duplicate mail after an SMTP/provider timeout.
    const {data:receipt,error:claimError}=await args.db
      .from("event_email_deliveries").insert({
        teacher_id:args.teacherId,event_id:args.event.id,
        guardian_id:message.guardianId,mode:args.mode,
        content_hash:contentHash,status:"attempted",
      }).select("id").single();
    if(claimError?.code==="23505"){skipped++;continue;}
    if(claimError||!receipt)
      throw new Error("Unable to reserve event invitation delivery; no email sent");
    const result=await sendEmail({
      to:message.to,bcc,subject:message.subject,text:message.text,
      locale:message.locale,fromName,replyTo:args.teacherEmail??undefined,portalUrl,
      idempotencyKey:`event/${args.event.id}/${message.guardianId}/${args.mode}/${contentHash}`,
    });
    const {error:markError}=await args.db.from("event_email_deliveries")
      .update({status:result.sent?"sent":"failed",
        sent_at:result.sent?new Date().toISOString():null})
      .eq("id",receipt.id).eq("teacher_id",args.teacherId);
    if(markError)throw new Error("Event delivery acknowledgement unavailable; inspect receipt before retrying");
    if(result.sent)sent++;
    else skipped++;
  }
  return {sent,skipped};
}
