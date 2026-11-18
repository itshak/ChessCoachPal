/**
 * One contact × student × workplace capability, without Family/guardian
 * compatibility. Teacher operations use the same service for website and MCP.
 * Only the browser-only issue operation reveals the fresh secret once; MCP
 * must never receive URL/token/digest. Every guest read/write independently
 * reauthorizes this exact grant before fetching a resource.
 */
import {createHash,randomBytes} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {z} from "zod";
import {portalGrantCreateSchema,portalGrantRevokeSchema,
  type PortalGrantPermission} from "./portal-grant-schemas";

type Db=SupabaseClient;
type Input=z.infer<typeof portalGrantCreateSchema>;
type Revoke=z.infer<typeof portalGrantRevokeSchema>;
type GrantRow=Record<string,unknown>;
const columns="id,teacher_id,contact_id,student_id,workplace_id,billing_account_id,permissions,expires_at,revoked_at,issued_at,revision,created_at,updated_at,last_request_id,last_request_hash";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const digest=(value:unknown)=>hash(JSON.stringify(value));

export class PortalGrantError extends Error{
  constructor(public readonly status:number,public readonly code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{throw new PortalGrantError(status,code,message);};

export interface PortalGrantView {
  id:string;contactId:string;studentId:string;workplaceId:string;
  billingAccountId:string|null;permissions:PortalGrantPermission[];
  expiresAt:string;revokedAt:string|null;issued:boolean;revision:number;
  createdAt:string;
}
export function safePortalGrant(row:GrantRow):PortalGrantView{
  return {id:String(row.id),contactId:String(row.contact_id),studentId:String(row.student_id),
    workplaceId:String(row.workplace_id),billingAccountId:row.billing_account_id?String(row.billing_account_id):null,
    permissions:(row.permissions??[]) as PortalGrantPermission[],expiresAt:String(row.expires_at),
    revokedAt:row.revoked_at?String(row.revoked_at):null,issued:Boolean(row.issued_at)&&!row.revoked_at,
    revision:Number(row.revision),createdAt:String(row.created_at)};
}

async function owned(db:Db,teacherId:string,table:string,id:string,extra?:string){
  const query=db.from(table).select(extra??"id").eq("teacher_id",teacherId).eq("id",id);
  const {data,error}=await query.maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Cannot verify resource ownership");
  if(!data)fail(404,"NOT_FOUND","One or more resources were not found");
  return data as unknown as GrantRow;
}
async function grant(db:Db,teacherId:string,id:string){
  const {data,error}=await db.from("portal_access_grants").select(columns)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Cannot read portal grant");
  if(!data)fail(404,"NOT_FOUND","Portal grant not found");
  return data as unknown as GrantRow;
}
export async function teacherPortalGrantsList(db:Db,teacherId:string,contactId?:string,studentId?:string){
  const rows:PortalGrantView[]=[];
  for(let offset=0;offset<10000;offset+=250){
    let query=db.from("portal_access_grants").select(columns)
      .eq("teacher_id",teacherId).order("created_at",{ascending:false}).range(offset,offset+249);
    if(contactId)query=query.eq("contact_id",contactId);
    if(studentId)query=query.eq("student_id",studentId);
    const {data,error}=await query;
    if(error)fail(500,"DATABASE_ERROR","Cannot list portal grants");
    rows.push(...(data??[]).map(safePortalGrant));
    if((data??[]).length<250)return rows;
  }
  return fail(413,"TOO_MANY_GRANTS","Portal grant listing exceeds safe limit");
}
export async function teacherPortalGrantGet(db:Db,teacherId:string,id:string){
  return safePortalGrant(await grant(db,teacherId,id));
}
export async function teacherPortalGrantCreate(db:Db,teacherId:string,input:Input){
  // Validation exists in route/MCP too, but the shared service owns the
  // authorization invariant and checks every referenced object independently.
  const value=portalGrantCreateSchema.parse(input);
  const expiry=new Date(value.expiresAt).getTime(),now=Date.now();
  if(!Number.isFinite(expiry)||expiry<=now||expiry>now+366*24*60*60*1000)
    fail(400,"INVALID_EXPIRY","Portal grants must expire within one year");
  const [contact,student,workplace]=await Promise.all([
    owned(db,teacherId,"contacts",value.contactId,"id,status"),
    owned(db,teacherId,"students",value.studentId,"id,archived_at"),
    owned(db,teacherId,"workplaces",value.workplaceId),
  ]);
  if(contact.status!=="active")fail(409,"CONTACT_ARCHIVED","Cannot grant an archived contact access");
  if(student.archived_at)fail(409,"STUDENT_ARCHIVED","Reactivate the student before sharing");
  // Explicit relationship is required to avoid giving an unrelated person a
  // direct secret merely by knowing valid tenant object IDs.
  const {data:link,error:linkError}=await db.from("student_contacts").select("id")
    .eq("teacher_id",teacherId).eq("student_id",value.studentId)
    .eq("contact_id",value.contactId).is("active_to",null)
    .or(`active_from.is.null,active_from.lte.${new Date().toISOString().slice(0,10)}`)
    .limit(1).maybeSingle();
  if(linkError)fail(500,"DATABASE_ERROR","Cannot verify contact relationship");
  if(!link)fail(403,"CONTACT_NOT_LINKED","Link the contact explicitly before sharing");
  if(value.billingAccountId){
    const payer=await owned(db,teacherId,"billing_accounts",value.billingAccountId,"id,status");
    if(payer.status!=="active")fail(409,"PAYER_ARCHIVED","Cannot share archived billing account");
  }
  // Relationship and student enrollment in a workplace are distinct. Requiring
  // actual membership protects against a typo selecting another workplace.
  const {data:enrollment,error:enrollmentError}=await db.from("workplace_enrollments")
    .select("id").eq("teacher_id",teacherId).eq("workplace_id",value.workplaceId)
    .eq("student_id",value.studentId).limit(1).maybeSingle();
  if(enrollmentError)fail(500,"DATABASE_ERROR","Cannot verify workplace enrollment");
  if(!enrollment)fail(409,"NOT_ENROLLED","The selected student is not enrolled in that workplace");
  const normalized={contact_id:value.contactId,student_id:value.studentId,
    workplace_id:value.workplaceId,billing_account_id:value.billingAccountId,
    permissions:[...value.permissions].sort(),expires_at:new Date(expiry).toISOString()};
  const requestHash=digest(["portal-grant-create",normalized]);
  const {data,error}=await db.from("portal_access_grants").insert({id:value.idempotencyKey,
    teacher_id:teacherId,...normalized,last_request_id:value.idempotencyKey,
    last_request_hash:requestHash}).select(columns).maybeSingle();
  if(!error&&data)return {...safePortalGrant(data),replayed:false,secretNotReturned:true};
  if(error?.code==="23505"){
    const previous=await grant(db,teacherId,value.idempotencyKey);
    if(previous.last_request_hash===requestHash&&previous.last_request_id===value.idempotencyKey)
      return {...safePortalGrant(previous),replayed:true,secretNotReturned:true};
    fail(409,"IDEMPOTENCY_CONFLICT","The request ID was reused for another portal grant");
  }
  return fail(500,"DATABASE_ERROR","Unable to create portal grant");
}
export async function teacherPortalGrantRevoke(db:Db,teacherId:string,id:string,input:Revoke){
  const value=portalGrantRevokeSchema.parse(input),requestHash=digest([
    "portal-grant-revoke",id,value.expectedRevision]);
  const {data,error}=await db.from("portal_access_grants").update({
    revoked_at:new Date().toISOString(),revision:value.expectedRevision+1,
    token_digest:null,last_request_id:value.idempotencyKey,last_request_hash:requestHash,
    updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",id).eq("revision",value.expectedRevision)
    .is("revoked_at",null).select(columns).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Unable to revoke portal grant");
  if(data)return {...safePortalGrant(data),replayed:false};
  const previous=await grant(db,teacherId,id);
  if(previous.last_request_id===value.idempotencyKey&&previous.last_request_hash===requestHash)
    return {...safePortalGrant(previous),replayed:true};
  fail(409,"STALE_REVISION","The grant changed or was revoked; reload before updating");
}
/** Only a securely authenticated TEACHER website endpoint can call this. */
export async function teacherPortalGrantIssueBrowserOnly(db:Db,teacherId:string,id:string,
  expectedRevision:number){
  const row=await grant(db,teacherId,id);
  if(row.revoked_at)fail(409,"REVOKED","The grant has been revoked");
  if(new Date(String(row.expires_at)).getTime()<=Date.now())
    fail(409,"EXPIRED","The grant has expired");
  if(row.revision!==expectedRevision)fail(409,"STALE_REVISION","Reload the grant");
  const secret=randomBytes(32).toString("base64url");
  const {data,error}=await db.from("portal_access_grants")
    .update({token_digest:hash(secret),issued_at:new Date().toISOString(),
      revision:expectedRevision+1,updated_at:new Date().toISOString()})
    .eq("teacher_id",teacherId).eq("id",id).eq("revision",expectedRevision)
    .is("revoked_at",null).select(columns).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Unable to issue portal link");
  if(!data)fail(409,"STALE_REVISION","Grant changed during link issuance");
  // Never persist the raw token, and never expose it through an MCP operation.
  return {grant:safePortalGrant(data as GrantRow),secret};
}

export interface PortalAuthorization {
  id:string;teacherId:string;contactId:string;studentId:string;workplaceId:string;
  billingAccountId:string|null;permissions:ReadonlySet<PortalGrantPermission>;
}
/** External browser route called with a one-off random secret, never a guardian token. */
export async function portalAuthorizeToken(db:Db,rawToken:string):Promise<PortalAuthorization|null>{
  if(!/^[A-Za-z0-9_-]{42,44}$/.test(rawToken))return null;
  const {data,error}=await db.from("portal_access_grants")
    .select(columns).eq("token_digest",hash(rawToken))
    .is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error||!data)return null;
  const row=data as GrantRow;
  // Recheck current authority for EVERY guest request. Deleting an enrollment,
  // archiving the student/payer or ending a relationship must immediately
  // invalidate the grant even when its token has not reached expiry.
  const [contact,student,link,enrollment,payer]=await Promise.all([
    db.from("contacts").select("id,status").eq("id",String(row.contact_id))
      .eq("teacher_id",String(row.teacher_id)).maybeSingle(),
    db.from("students").select("id,archived_at").eq("id",String(row.student_id))
      .eq("teacher_id",String(row.teacher_id)).maybeSingle(),
    db.from("student_contacts").select("id")
      .eq("teacher_id",String(row.teacher_id)).eq("student_id",String(row.student_id))
      .eq("contact_id",String(row.contact_id)).is("active_to",null)
      .or(`active_from.is.null,active_from.lte.${new Date().toISOString().slice(0,10)}`)
      .limit(1).maybeSingle(),
    db.from("workplace_enrollments").select("id")
      .eq("teacher_id",String(row.teacher_id)).eq("student_id",String(row.student_id))
      .eq("workplace_id",String(row.workplace_id)).maybeSingle(),
    row.billing_account_id?db.from("billing_accounts").select("id,status")
      .eq("teacher_id",String(row.teacher_id)).eq("id",String(row.billing_account_id))
      .maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  if(contact.error||contact.data?.status!=="active"||student.error||
    !student.data||student.data.archived_at||link.error||!link.data||
    enrollment.error||!enrollment.data||payer.error||
    (row.billing_account_id&&payer.data?.status!=="active"))return null;
  return {id:String(row.id),teacherId:String(row.teacher_id),contactId:String(row.contact_id),
    studentId:String(row.student_id),workplaceId:String(row.workplace_id),
    billingAccountId:row.billing_account_id?String(row.billing_account_id):null,
    permissions:new Set(row.permissions as PortalGrantPermission[])};
}
/** Fail closed for missing/unknown resource workplace, student or billing owner. */
export function portalGrantAllows(grant:PortalAuthorization,
  permission:PortalGrantPermission,resource:{teacherId:string;studentId:string;
  workplaceId:string|null;billingAccountId?:string|null}):boolean{
  if(!grant.permissions.has(permission)||grant.teacherId!==resource.teacherId||
    grant.studentId!==resource.studentId||grant.workplaceId!==resource.workplaceId)return false;
  if(permission==="finance")return Boolean(grant.billingAccountId)&&
    grant.billingAccountId===resource.billingAccountId;
  return true;
}
