/**
 * Guest reader over ONLY the current explicit per-contact capability model.
 * This module never selects guardians, family tokens, or studio settings.
 * Unscoped resource/workplace attribution fails closed.
 */
import type {SupabaseClient} from "@supabase/supabase-js";
import {portalAuthorizeToken,portalGrantAllows,
  type PortalAuthorization} from "./portal-grants-service";
import {canonicalCalendarWindow,type CanonicalCalendarRow}
  from "./canonical-calendar-read";
import {toLocalDateString} from "@/lib/schedule";

type Db=SupabaseClient;
export interface PortalContext{
  grant:PortalAuthorization;
  contact:{id:string;displayName:string;preferredLocale:string|null};
  student:{id:string;name:string};
  workplace:{id:string;name:string;timezone:string;locale:string;currency:string;
    cancellationWindowHours:number};
}
export async function resolvePortalContext(db:Db,secret:string):Promise<PortalContext|null>{
  const grant=await portalAuthorizeToken(db,secret);
  if(!grant)return null;
  const [contact,student,workplace]=await Promise.all([
    db.from("contacts").select("id,display_name,preferred_locale,status")
      .eq("id",grant.contactId).eq("teacher_id",grant.teacherId).maybeSingle(),
    db.from("students").select("id,name").eq("id",grant.studentId)
      .eq("teacher_id",grant.teacherId).maybeSingle(),
    db.from("workplaces").select("id,name,timezone,locale,currency,policy")
      .eq("id",grant.workplaceId).eq("teacher_id",grant.teacherId).maybeSingle(),
  ]);
  if(contact.error||student.error||workplace.error||
    contact.data?.status!=="active"||!student.data||!workplace.data)return null;
  const wp=workplace.data;
  const rawPolicy=wp.policy as Record<string,unknown>|null;
  const hours=rawPolicy?.cancellationWindowHours;
  const cancellationWindowHours=typeof hours==="number"&&Number.isInteger(hours)&&
    hours>=0&&hours<=336?hours:24;
  return {grant,contact:{id:contact.data.id,displayName:contact.data.display_name,
    preferredLocale:contact.data.preferred_locale},
    student:{id:student.data.id,name:student.data.name},
    workplace:{id:wp.id,name:wp.name,timezone:wp.timezone,locale:wp.locale,
      currency:wp.currency,cancellationWindowHours}};
}
export async function portalCalendarForContext(db:Db,ctx:PortalContext,from:string,to:string){
  if(!ctx.grant.permissions.has("calendar"))return [] as CanonicalCalendarRow[];
  const lessons=await canonicalCalendarWindow(db,ctx.grant.teacherId,
    from,to,ctx.workplace.timezone,[ctx.grant.studentId]);
  return lessons.filter(session=>session.workplace_id===ctx.grant.workplaceId&&
    portalGrantAllows(ctx.grant,"calendar",{
      teacherId:ctx.grant.teacherId,studentId:ctx.grant.studentId,
      workplaceId:session.workplace_id})).map(session=>({
        ...session,participants:session.participants.filter(person=>
          person.studentId===ctx.grant.studentId),
      })).filter(session=>session.participants.length>0);
}
export async function portalSharedNotesForContext(db:Db,ctx:PortalContext,
  lessons:CanonicalCalendarRow[]){
  if(!ctx.grant.permissions.has("shared_notes"))return [];
  const scoped=lessons.filter(session=>session.workplace_id===ctx.grant.workplaceId);
  const ids=[...new Set(scoped.map(s=>s.id))];
  if(!ids.length)return [];
  const allowed=new Map(scoped.map(s=>[s.id,s]));
  const results:{id:string;sessionId:string;body:string;date:string}[]=[];
  for(let i=0;i<ids.length;i+=80){
    const {data,error}=await db.from("session_notes")
      .select("id,session_id,student_id,body,shared_with_guardian")
      .eq("teacher_id",ctx.grant.teacherId).eq("shared_with_guardian",true)
      .in("session_id",ids.slice(i,i+80)).order("updated_at",{ascending:false}).limit(400);
    if(error)throw new Error("Unable to read approved session notes");
    for(const note of data??[]){
      const session=allowed.get(note.session_id);
      if(!session||session.workplace_id!==ctx.grant.workplaceId||
        (note.student_id!==null&&note.student_id!==ctx.grant.studentId))continue;
      results.push({id:note.id,sessionId:session.id,body:note.body,
        date:toLocalDateString(new Date(session.starts_at),ctx.workplace.timezone)});
    }
  }
  return results.slice(0,50);
}

export interface PortalVisibleEvent {
  id:string;title:string;description:string;location:string;
  startsAt:string;endsAt:string|null;
  rsvp:{status:"pending"|"yes"|"no"|"maybe";
    partySize:number|null;note:string};
}
/** Extra explicit invitation is required after a portal event permission. */
export async function portalEventsForContext(db:Db,ctx:PortalContext):Promise<PortalVisibleEvent[]>{
  if(!ctx.grant.permissions.has("event_rsvp"))return [];
  const {data:invites,error:inviteError}=await db.from("portal_event_invitations")
    .select("event_id,status,party_size,note")
    .eq("teacher_id",ctx.grant.teacherId).eq("portal_grant_id",ctx.grant.id)
    .is("revoked_at",null).limit(150);
  if(inviteError)throw new Error("Cannot load scoped invitations");
  const ids=[...new Set((invites??[]).map(x=>x.event_id))];
  if(!ids.length)return [];
  const [events,students]=await Promise.all([
    db.from("events").select("id,title,description,location,starts_at,ends_at,workplace_id")
      .eq("teacher_id",ctx.grant.teacherId).eq("workplace_id",ctx.grant.workplaceId)
      .in("id",ids).gte("starts_at",new Date().toISOString())
      .order("starts_at").limit(150),
    db.from("event_students").select("event_id").eq("student_id",ctx.grant.studentId)
      .in("event_id",ids),
  ]);
  if(events.error||students.error)throw new Error("Cannot verify scoped event roster");
  const roster=new Set((students.data??[]).map(x=>x.event_id));
  const inviteByEvent=new Map((invites??[]).map(x=>[x.event_id,x]));
  return (events.data??[]).filter(event=>roster.has(event.id)&&
    event.workplace_id===ctx.grant.workplaceId).map(event=>{
      const invite=inviteByEvent.get(event.id)!;
      return {id:event.id,title:event.title,description:event.description,
        location:event.location,startsAt:event.starts_at,endsAt:event.ends_at,
        rsvp:{status:invite.status as PortalVisibleEvent["rsvp"]["status"],
          partySize:invite.party_size,note:invite.note},
      };
    });
}
