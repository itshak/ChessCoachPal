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
 repertoireByStudent?:Record<string,string>;
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
async function eventStudents(db:Db,teacherId:string,ids:string[]){
 const unique=[...new Set(ids)];
 if(unique.length!==ids.length||ids.length>200)throw failure(400,"VALIDATION_ERROR","Invalid or duplicate student IDs");
 if(!ids.length)return [];
 const {data,error}=await db.from("students").select("id,guardian_id,archived_at")
  .eq("teacher_id",teacherId).in("id",ids);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to validate event students");
 if(data?.length!==ids.length)throw failure(404,"NOT_FOUND","Student not found");
 if(data.some(x=>x.archived_at))throw failure(409,"ARCHIVED","Reactivate archived students before adding to future events");
 return data;
}
async function setEventStudents(db:Db,teacherId:string,eventId:string,ids:string[],
 repertoire:Record<string,string>,replace:boolean){
 const owned=await eventStudents(db,teacherId,ids);
 if(replace){
  const {error}=await db.from("event_students").delete().eq("event_id",eventId);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to update event roster");
 }
 if(ids.length){
  const rows=ids.map((studentId,index)=>({
   event_id:eventId,student_id:studentId,
   repertoire:typeof repertoire[studentId]==="string"?repertoire[studentId].trim().slice(0,10000):"",
   sort_order:index,
  }));
  const {error}=await db.from("event_students").insert(rows);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to attach event students");
 }
 const guardianIds=[...new Set(owned.map(x=>x.guardian_id).filter((v):v is string=>typeof v==="string"&&v.length>0))];
 if(replace) {
  const {data:existing,error}=await db.from("event_rsvps").select("id,guardian_id")
   .eq("event_id",eventId);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to inspect event responses");
  const keep=new Set(guardianIds),present=new Set((existing??[]).map(x=>x.guardian_id));
  const remove=(existing??[]).filter(x=>!keep.has(x.guardian_id)).map(x=>x.id);
  if(remove.length){
   const {error:removeError}=await db.from("event_rsvps").delete().in("id",remove);
   if(removeError)throw failure(500,"DATABASE_ERROR","Unable to sync event responses");
  }
  const add=guardianIds.filter(x=>!present.has(x));
  if(add.length){
   const {error:addError}=await db.from("event_rsvps").insert(add.map(guardian_id=>({
    event_id:eventId,guardian_id,status:"pending" as const,
   })));
   if(addError)throw failure(500,"DATABASE_ERROR","Unable to add event responses");
  }
 } else if(guardianIds.length){
  const {error}=await db.from("event_rsvps").upsert(guardianIds.map(guardian_id=>({
   event_id:eventId,guardian_id,status:"pending" as const,
  })),{onConflict:"event_id,guardian_id",ignoreDuplicates:true});
  if(error)throw failure(500,"DATABASE_ERROR","Unable to initialize event responses");
 }
}
export async function teacherEventsList(db:Db,teacherId:string){
 const {data,error}=await db.from("events").select(`
 id,title,description,location,starts_at,ends_at,created_at,updated_at,
 event_students (id), event_rsvps (status)
 `).eq("teacher_id",teacherId).order("starts_at",{ascending:false}).limit(1000);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to list events");
 return {events:(data??[]).map(row=>{
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
 if(input.endsAt&& !validDate(input.endsAt))throw failure(400,"VALIDATION_ERROR","Invalid end datetime");
 const endError=validateEventEndAfterStart(input.startsAt!,input.endsAt);
 if(endError)throw failure(400,"VALIDATION_ERROR",endError);
 await eventStudents(db,teacherId,input.studentIds??[]);
 const {data:event,error}=await db.from("events").insert({
  teacher_id:teacherId,title,description:input.description?.trim()??"",
  location:input.location?.trim()??"",starts_at:input.startsAt,
  ends_at:input.endsAt||null,send_reminder:input.sendReminder??false,
 }).select(info).single();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to create event");
 await setEventStudents(db,teacherId,event.id,input.studentIds??[],input.repertoireByStudent??{},false);
 return {event:{
  id:event.id,title:event.title,description:event.description,location:event.location,
  startsAt:event.starts_at,endsAt:event.ends_at,sendReminder:event.send_reminder,
  reminderSentAt:event.reminder_sent_at,createdAt:event.created_at,updatedAt:event.updated_at,
 }};
}
export async function teacherEventUpdate(db:Db,teacherId:string,id:string,input:TeacherEventInput){
 const before=await ownedEvent(db,teacherId,id);
 if(input.studentIds!==undefined)await eventStudents(db,teacherId,input.studentIds);
 const update:Record<string,unknown>={updated_at:new Date().toISOString()};
 if(input.title!==undefined){
  if(!input.title.trim())throw failure(400,"VALIDATION_ERROR","Event title required");
  update.title=input.title.trim();
 }
 if(input.description!==undefined)update.description=input.description.trim();
 if(input.location!==undefined)update.location=input.location.trim();
 if(input.startsAt!==undefined){
  if(!validDate(input.startsAt))throw failure(400,"VALIDATION_ERROR","Invalid start datetime");
  update.starts_at=input.startsAt;
  if(input.startsAt!==before.starts_at)update.reminder_sent_at=null;
 }
 if(input.endsAt!==undefined){
  if(input.endsAt&&!validDate(input.endsAt))throw failure(400,"VALIDATION_ERROR","Invalid end datetime");
  update.ends_at=input.endsAt||null;
 }
 if(input.sendReminder!==undefined)update.send_reminder=input.sendReminder;
 const endError=validateEventEndAfterStart(
  (update.starts_at??before.starts_at) as string,
  (update.ends_at!==undefined?update.ends_at:before.ends_at) as string|null);
 if(endError)throw failure(400,"VALIDATION_ERROR",endError);
 const {error}=await db.from("events").update(update)
  .eq("teacher_id",teacherId).eq("id",id);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to update event");
 if(input.studentIds!==undefined)
  await setEventStudents(db,teacherId,id,input.studentIds,input.repertoireByStudent??{},true);
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
  event,policy,teacherEmail,origin,mode:"invite",
 });
 return {sent,skipped};
}
