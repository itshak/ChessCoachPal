import type { SupabaseClient } from "@supabase/supabase-js";
import { validateEventEndAfterStart } from "@/lib/events";
import { oneToOne } from "@/lib/schedule";
import { familyDisplayName } from "@/lib/guardians";
import { loadEventForEmail, previewEventEmails, sendEventEmails } from "@/lib/server/event-email";
import { getPolicy } from "@/lib/server/scheduling";
import type { RsvpStatus } from "@/lib/supabase/types";

type Db=SupabaseClient;
export class TeacherEventError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(s:number,c:string,m:string)=>new TeacherEventError(s,c,m);
export type TeacherEventInput={
 title?:string;description?:string;location?:string;startsAt?:string;
 endsAt?:string|null;sendReminder?:boolean;studentIds?:string[];
 repertoireByStudent?:Record<string,string>;idempotencyKey?:string;
};
const validDate=(v:string|undefined)=>!!v&&!Number.isNaN(Date.parse(v));
const info="id,title,description,location,starts_at,ends_at,send_reminder,reminder_sent_at,created_at,updated_at";
async function ownedEvent(db:Db,teacherId:string,id:string) {
 const {data,error}=await db.from("events").select(info)
  .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Event lookup failed");
 if(!data)throw failure(404,"NOT_FOUND","Event not found");
 return data;
}
/** One database transaction owns the event, roster and related RSVP rows. */
async function saveEvent(db:Db,teacherId:string,id:string|null,input:TeacherEventInput){
  const fields:Record<string,unknown>={};
  if(input.title!==undefined)fields.title=input.title.trim();
  if(input.description!==undefined)fields.description=input.description.trim();
  if(input.location!==undefined)fields.location=input.location.trim();
  if(input.startsAt!==undefined)fields.starts_at=input.startsAt;
  if(input.endsAt!==undefined)fields.ends_at=input.endsAt||null;
  if(input.sendReminder!==undefined)fields.send_reminder=input.sendReminder;
  if(input.idempotencyKey!==undefined&&
     !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey))
    throw failure(400,"VALIDATION_ERROR","Event idempotencyKey must be a UUID");
  const {data,error}=await db.rpc("ccp_teacher_event_save_replay",{
    p_event_id:id,p_fields:fields,
    p_student_ids:input.studentIds===undefined?(id?null:[]):input.studentIds,
    p_repertoire:input.repertoireByStudent??{},
    p_request_id:input.idempotencyKey??null,
  });
  void teacherId;
  if(error) {
    if(error.code==="23505"||error.message.includes("EVENT_REQUEST_CONFLICT"))
      throw failure(409,"IDEMPOTENCY_CONFLICT",
        "This event idempotencyKey was already used with different details");
    if(error.code==="22023"||error.code==="22007"||error.code==="22008")
      throw failure(400,"VALIDATION_ERROR","Invalid event dates, details or roster");
    if(error.message.includes("NOT_FOUND")||error.code==="42501")
      throw failure(404,"NOT_FOUND","Event or student not found");
    throw failure(500,"DATABASE_ERROR","Unable to save event and invitations");
  }
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw failure(500,"DATABASE_ERROR","Event transaction returned invalid data");
  return data as Record<string,any>;
}
export async function teacherEventsList(db:Db,teacherId:string){
 const all:Record<string,any>[]=[];
 const size=500,maxRows=20000;
 for(let offset=0;;offset+=size){
   const {data,error}=await db.from("events").select(`
   id,title,description,location,starts_at,ends_at,created_at,updated_at,
   event_students (id), event_rsvps (status)
   `).eq("teacher_id",teacherId).order("starts_at",{ascending:false})
     .order("id",{ascending:false}).range(offset,offset+size-1);
   if(error)throw failure(500,"DATABASE_ERROR","Unable to list events");
   const rows=data??[];
   if(all.length+rows.length>maxRows)
     throw failure(413,"HISTORY_TOO_LARGE","Event history exceeds safe listing size");
   all.push(...rows);
   if(rows.length<size)break;
 }
 return {events:all.map(row=>{
  const statuses=(row.event_rsvps??[]) as {status:RsvpStatus}[];
  return {
   id:row.id,title:row.title,description:row.description,location:row.location,
   startsAt:row.starts_at,endsAt:row.ends_at,createdAt:row.created_at,updatedAt:row.updated_at,
   studentCount:(row.event_students as {id:string}[]|null)?.length??0,
   rsvpCount:statuses.length,rsvpYesCount:statuses.filter(r=>r.status==="yes").length,
   rsvpPendingCount:statuses.filter(r=>r.status==="pending").length,
  };
 })};
}
export async function teacherEventDetail(db:Db,teacherId:string,id:string) {
 await ownedEvent(db,teacherId,id);
 const {data:event,error}=await db.from("events").select(`
 id,title,description,location,starts_at,ends_at,send_reminder,reminder_sent_at,created_at,updated_at,
 event_students(id,student_id,repertoire,sort_order,students(id,name)),
 event_rsvps(id,guardian_id,status,party_size,note,responded_at,guardians(id,name,family_name))
 `).eq("id",id).eq("teacher_id",teacherId).maybeSingle();
 if(error||!event)throw failure(500,"DATABASE_ERROR","Unable to load event");
 const students=((event.event_students??[]) as unknown as {
  id:string;student_id:string;repertoire:string;sort_order:number;
  students:{id:string;name:string}|{id:string;name:string}[]|null;
 }[]).map(x=>({
  id:x.id,studentId:x.student_id,name:oneToOne(x.students)?.name??"Student",
  repertoire:x.repertoire,sortOrder:x.sort_order,
 })).sort((a,b)=>a.sortOrder-b.sortOrder);
 const rsvps=((event.event_rsvps??[]) as unknown as {
  id:string;guardian_id:string;status:string;party_size:number|null;note:string;
  responded_at:string|null;
  guardians:{id:string;name:string;family_name:string|null}|{id:string;name:string;family_name:string|null}[]|null;
 }[]).map(x=>({
  id:x.id,guardianId:x.guardian_id,guardianName:oneToOne(x.guardians)?familyDisplayName(oneToOne(x.guardians)!):"Family",
  status:x.status,partySize:x.party_size,note:x.note,respondedAt:x.responded_at,
 }));
 return {event:{
  id:event.id,title:event.title,description:event.description,location:event.location,
  startsAt:event.starts_at,endsAt:event.ends_at,sendReminder:event.send_reminder,
  reminderSentAt:event.reminder_sent_at,createdAt:event.created_at,updatedAt:event.updated_at,
  students,rsvps,
 }};
}
export async function teacherEventCreate(db:Db,teacherId:string,input:TeacherEventInput){
 const title=input.title?.trim();
 if(!title||title.length>200)throw failure(400,"VALIDATION_ERROR","Event title required");
 if(!validDate(input.startsAt))throw failure(400,"VALIDATION_ERROR","Valid start datetime required");
 if(input.endsAt&&!validDate(input.endsAt))throw failure(400,"VALIDATION_ERROR","Invalid end datetime");
 const endError=validateEventEndAfterStart(input.startsAt!,input.endsAt);
 if(endError)throw failure(400,"VALIDATION_ERROR",endError);
 const event=await saveEvent(db,teacherId,null,input);
 return {event:{
   id:event.id,title:event.title,description:event.description,location:event.location,
   startsAt:event.starts_at,endsAt:event.ends_at,sendReminder:event.send_reminder,
   reminderSentAt:event.reminder_sent_at,createdAt:event.created_at,updatedAt:event.updated_at,
 }};
}
export async function teacherEventUpdate(db:Db,teacherId:string,id:string,input:TeacherEventInput){
 const before=await ownedEvent(db,teacherId,id);
 if(input.title!==undefined&&!input.title.trim())
   throw failure(400,"VALIDATION_ERROR","Event title required");
 if(input.startsAt!==undefined&&!validDate(input.startsAt))
   throw failure(400,"VALIDATION_ERROR","Invalid start datetime");
 if(input.endsAt&&!validDate(input.endsAt))
   throw failure(400,"VALIDATION_ERROR","Invalid end datetime");
 const endError=validateEventEndAfterStart(
   input.startsAt??before.starts_at,input.endsAt===undefined?before.ends_at:input.endsAt);
 if(endError)throw failure(400,"VALIDATION_ERROR",endError);
 await saveEvent(db,teacherId,id,input);
 return {ok:true};
}
export async function teacherEventDeleteImpact(db:Db,teacherId:string,id:string){
 await ownedEvent(db,teacherId,id);
 const [{count:studentCount,error:sError},{count:rsvpCount,error:rError}]=await Promise.all([
  db.from("event_students").select("id",{count:"exact",head:true}).eq("event_id",id),
  db.from("event_rsvps").select("id",{count:"exact",head:true}).eq("event_id",id),
 ]);
 if(sError||rError)throw failure(500,"DATABASE_ERROR","Unable to preview event deletion");
 return {eventId:id,studentCount:studentCount??0,rsvpCount:rsvpCount??0};
}
export async function teacherEventDelete(db:Db,teacherId:string,id:string){
 await ownedEvent(db,teacherId,id);
 const {data,error}=await db.from("events").delete().eq("teacher_id",teacherId).eq("id",id)
  .select("id").maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to delete event");
 if(!data)throw failure(404,"NOT_FOUND","Event not found");
 return {ok:true};
}
/** Teacher-approved preview; tokens stay in the internal send service only. */
export async function teacherEventInvitePreview(
 db:Db,teacherId:string,id:string,includeRecipients=false
){
 const event=await loadEventForEmail(db,id,teacherId);
 if(!event)throw failure(404,"NOT_FOUND","Event not found");
 const policy=await getPolicy(db,teacherId);
 return previewEventEmails({event,policy,mode:"invite",includeRecipients});
}
export async function teacherEventInviteEmail(db:Db,teacherId:string,id:string,
 teacherEmail:string|undefined,origin:string){
 const event=await loadEventForEmail(db,id,teacherId);
 if(!event)throw failure(404,"NOT_FOUND","Event not found");
 const policy=await getPolicy(db,teacherId);
 const {sent,skipped}=await sendEventEmails({
  db,teacherId,event,policy,teacherEmail,origin,mode:"invite",
 });
 return {sent,skipped};
}
