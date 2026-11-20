import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {PortalGrantError,teacherPortalGrantGet} from "./portal-grants-service";

const uuid=z.string().uuid();
export const portalEventInviteCreateSchema=z.object({
  portalGrantId:uuid,idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const portalEventInviteRevokeSchema=z.object({
  expectedRevision:z.number().int().min(1),idempotencyKey:uuid,
  confirmed:z.literal(true),
}).strict();
type DB=SupabaseClient;
type Row=Record<string,unknown>;
const columns="id,teacher_id,event_id,portal_grant_id,status,party_size,note,responded_at,revoked_at,revision,last_request_id,last_request_hash,created_at,updated_at";
const sha=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail=(status:number,code:string,message:string):never=>{
  throw new PortalGrantError(status,code,message);
};
function safe(row:Row,includeNote=false){return {
  id:String(row.id),eventId:String(row.event_id),portalGrantId:String(row.portal_grant_id),
  status:row.status,partySize:row.party_size,respondedAt:row.responded_at,
  revokedAt:row.revoked_at,revision:Number(row.revision),createdAt:row.created_at,
  ...(includeNote?{note:row.note}:{})
};}
async function getRow(db:DB,teacherId:string,id:string){
  const {data,error}=await db.from("portal_event_invitations").select(columns)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Invite lookup failed");
  if(!data)fail(404,"NOT_FOUND","Invite not found");
  return data as Row;
}
export async function teacherPortalEventInvitesList(db:DB,teacherId:string,eventId:string){
  const {data:event,error:evtError}=await db.from("events")
    .select("id").eq("teacher_id",teacherId).eq("id",eventId).maybeSingle();
  if(evtError)fail(500,"DATABASE_ERROR","Event unavailable");
  if(!event)return fail(404,"NOT_FOUND","Event not found");
  const rows:ReturnType<typeof safe>[]=[];
  for(let offset=0;offset<10000;offset+=250){
    const {data,error}=await db.from("portal_event_invitations").select(columns)
      .eq("teacher_id",teacherId).eq("event_id",eventId)
      .order("id").range(offset,offset+249);
    if(error)fail(500,"DATABASE_ERROR","Event invitations unavailable");
    rows.push(...(data??[]).map(row=>safe(row)));
    if((data??[]).length<250)return rows;
  }
  return fail(413,"TOO_MANY_INVITES","Event invitation list exceeds safe limit");
}
export async function teacherPortalEventInviteCreate(db:DB,teacherId:string,
  eventId:string,input:z.infer<typeof portalEventInviteCreateSchema>){
  const value=portalEventInviteCreateSchema.parse(input);
  const grant=await teacherPortalGrantGet(db,teacherId,value.portalGrantId);
  if(grant.revokedAt||new Date(grant.expiresAt).getTime()<=Date.now()||!grant.permissions.includes("event_rsvp"))
    return fail(409,"GRANT_NOT_ELIGIBLE","Grant has no active event RSVP permission");
  const {data:event,error:evtError}=await db.from("events")
    .select("id,workplace_id,starts_at").eq("teacher_id",teacherId).eq("id",eventId).maybeSingle();
  if(evtError)fail(500,"DATABASE_ERROR","Event unavailable");
  if(!event)return fail(404,"NOT_FOUND","Event not found");
  if(!event.workplace_id||event.workplace_id!==grant.workplaceId)
    return fail(409,"WORKPLACE_MISMATCH","Event must explicitly belong to the grant's workplace");
  if(new Date(event.starts_at).getTime()<=Date.now())
    return fail(409,"EVENT_PAST","Cannot invite a contact to a past event");
  const {data:roster,error:rosterError}=await db.from("event_students")
    .select("id").eq("event_id",eventId).eq("student_id",grant.studentId)
    .limit(1).maybeSingle();
  if(rosterError)fail(500,"DATABASE_ERROR","Event roster unavailable");
  if(!roster)fail(403,"NOT_INVITED_STUDENT","Student is not on the selected event roster");
  const requestHash=sha(["event-invite-create",teacherId,eventId,value.portalGrantId]);
  const {data,error}=await db.from("portal_event_invitations").insert({
    id:value.idempotencyKey,teacher_id:teacherId,event_id:eventId,
    portal_grant_id:value.portalGrantId,last_request_id:value.idempotencyKey,
    last_request_hash:requestHash,
  }).select(columns).maybeSingle();
  if(!error&&data)return {...safe(data),replayed:false};
  if(error?.code==="23505"){
    const {data:old,error:lookupError}=await db.from("portal_event_invitations").select(columns)
      .eq("teacher_id",teacherId).eq("id",value.idempotencyKey).maybeSingle();
    if(lookupError)fail(500,"DATABASE_ERROR","Invite replay unavailable");
    if(old?.last_request_id===value.idempotencyKey&&old.last_request_hash===requestHash)
      return {...safe(old),replayed:true};
    return fail(409,"INVITATION_CONFLICT","Invitation already exists or request ID was reused");
  }
  return fail(500,"DATABASE_ERROR","Unable to create explicit invitation");
}
export async function teacherPortalEventInviteRevoke(db:DB,teacherId:string,
  eventId:string,inviteId:string,input:z.infer<typeof portalEventInviteRevokeSchema>){
  const value=portalEventInviteRevokeSchema.parse(input);
  const requestHash=sha(["event-invite-revoke",eventId,inviteId,value.expectedRevision]);
  const {data,error}=await db.from("portal_event_invitations").update({
    revoked_at:new Date().toISOString(),revision:value.expectedRevision+1,
    last_request_id:value.idempotencyKey,last_request_hash:requestHash,
    updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("event_id",eventId).eq("id",inviteId)
    .eq("revision",value.expectedRevision).is("revoked_at",null)
    .select(columns).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Unable to revoke invitation");
  if(data)return {...safe(data),replayed:false};
  const old=await getRow(db,teacherId,inviteId);
  if(old.event_id!==eventId)fail(404,"NOT_FOUND","Invite not found");
  if(old.last_request_id===value.idempotencyKey&&old.last_request_hash===requestHash)
    return {...safe(old),replayed:true};
  return fail(409,"STALE_REVISION","Invite changed; reload before revoking");
}
