/**
 * First contact-identity vertical slice. Website and MCP must call these same
 * tenant-scoped operations; relationships are NEVER portal grants or debtors.
 *
 * Existing family portal/invoice write paths remain active until the separate
 * guarded cutover. No implicit portal secret, financial record, or notification
 * is created by any of these operations.
 */
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {z} from "zod";
import {
  contactCreateSchema,contactUpdateSchema,studentContactLinkSchema,
  studentContactUnlinkSchema,billingAccountCreateSchema,billingAccountUpdateSchema,
} from "./contact-schemas";

type DB=SupabaseClient;
type Create=z.infer<typeof contactCreateSchema>;
type Update=z.infer<typeof contactUpdateSchema>;
type Link=z.infer<typeof studentContactLinkSchema>;
type Unlink=z.infer<typeof studentContactUnlinkSchema>;
type BillingCreate=z.infer<typeof billingAccountCreateSchema>;
type BillingUpdate=z.infer<typeof billingAccountUpdateSchema>;

export class ContactServiceError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
  throw new ContactServiceError(status,code,message);
};
const contactColumns="id,teacher_id,display_name,kind,email,phone,preferred_locale,status,revision,created_at,updated_at,last_request_id,last_request_hash";
const billingColumns="id,teacher_id,display_name,account_kind,contact_id,status,revision,created_at,updated_at,last_request_id,last_request_hash";
const linkColumns="id,teacher_id,student_id,contact_id,relationship_label,is_legal_guardian,may_receive_messages,emergency_priority,active_from,active_to,revision,created_at,last_request_id,last_request_hash";
type Row=Record<string,unknown>;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const eq=(a:unknown,b:unknown)=>a===b;
const clean=(value:string|null|undefined)=>value===undefined?undefined:value===null?null:value.trim();
const normalize=(value:unknown)=>value===undefined?null:value;
const replay=(row:Row,key:string,hash:string)=>eq(row.last_request_id,key)&&eq(row.last_request_hash,hash);

function mappedContact(input:Partial<Create&Update>):Row {
  const result:Row={};
  if(input.displayName!==undefined)result.display_name=input.displayName.trim();
  if(input.kind!==undefined)result.kind=input.kind;
  if(input.email!==undefined)result.email=clean(input.email);
  if(input.phone!==undefined)result.phone=clean(input.phone);
  if(input.preferredLocale!==undefined)result.preferred_locale=input.preferredLocale;
  if(input.status!==undefined)result.status=input.status;
  return result;
}
function mappedBilling(input:Partial<BillingCreate&BillingUpdate>):Row {
  const result:Row={};
  if(input.displayName!==undefined)result.display_name=input.displayName.trim();
  if(input.accountKind!==undefined)result.account_kind=input.accountKind;
  if(input.contactId!==undefined)result.contact_id=input.contactId;
  if(input.status!==undefined)result.status=input.status;
  return result;
}
export function safeContact(row:Row,includeDetails=false){
  const {id,display_name,kind,status,revision,created_at,updated_at}=row;
  return includeDetails?
    {id,displayName:display_name,kind,status,revision,createdAt:created_at,
     updatedAt:updated_at,email:row.email,phone:row.phone,preferredLocale:row.preferred_locale}:
    {id,displayName:display_name,kind,status,revision,createdAt:created_at,
     updatedAt:updated_at};
}
export function safeBillingAccount(row:Row,includeContact=false){
  const {id,display_name,account_kind,status,revision,created_at,updated_at}=row;
  return includeContact?
    {id,displayName:display_name,accountKind:account_kind,status,revision,
     createdAt:created_at,updatedAt:updated_at,contactId:row.contact_id}:
    {id,displayName:display_name,accountKind:account_kind,status,revision,
     createdAt:created_at,updatedAt:updated_at};
}
export function safeContactLink(row:Row){
  return {id:row.id,studentId:row.student_id,contactId:row.contact_id,
    relationshipLabel:row.relationship_label,isLegalGuardian:row.is_legal_guardian,
    mayReceiveMessages:row.may_receive_messages,
    emergencyPriority:row.emergency_priority,activeFrom:row.active_from,
    activeTo:row.active_to,revision:row.revision,createdAt:row.created_at};
}
function dataError(message:string):never{return fail(500,"DATABASE_ERROR",message);}
async function contactRow(db:DB,teacherId:string,id:string):Promise<Row>{
  const {data,error}=await db.from("contacts").select(contactColumns)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)return dataError("Contact lookup unavailable");
  if(!data)return fail(404,"NOT_FOUND","Contact not found");
  return data as Row;
}
async function billingRow(db:DB,teacherId:string,id:string):Promise<Row>{
  const {data,error}=await db.from("billing_accounts").select(billingColumns)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)return dataError("Billing account lookup unavailable");
  if(!data)return fail(404,"NOT_FOUND","Billing account not found");
  return data as Row;
}
async function requireStudent(db:DB,teacherId:string,id:string){
  const {data,error}=await db.from("students").select("id")
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)return dataError("Student lookup unavailable");
  if(!data)return fail(404,"NOT_FOUND","Student not found");
}
async function requireActiveContact(db:DB,teacherId:string,id:string){
  const row=await contactRow(db,teacherId,id);
  if(row.status!=="active")return fail(409,"CONTACT_ARCHIVED","Contact is archived");
}
async function paginated(db:DB,table:"contacts"|"student_contacts"|"billing_accounts",
  teacherId:string,columns:string,studentId?:string){
  const rows:Row[]=[];
  for(let offset=0;offset<20000;offset+=500){
    let query=db.from(table).select(columns).eq("teacher_id",teacherId).order("id")
      .range(offset,offset+499);
    if(studentId)query=query.eq("student_id",studentId);
    const {data,error}=await query;
    if(error)return dataError("Unable to list contact records");
    rows.push(...((data??[]) as unknown as Row[]));
    if((data??[]).length<500)return rows;
  }
  return fail(413,"ROSTER_TOO_LARGE","Contact list exceeds safe listing limit");
}
export async function contactsList(db:DB,teacherId:string){
  return (await paginated(db,"contacts",teacherId,contactColumns)).map(row=>safeContact(row));
}
export async function contactDetail(db:DB,teacherId:string,id:string){
  return contactRow(db,teacherId,id);
}
export async function contactCreate(db:DB,teacherId:string,input:Create){
  const fields=mappedContact(input);
  const requestHash=digest(["contact-create",fields]);
  const row={id:input.idempotencyKey,teacher_id:teacherId,
    ...fields,last_request_id:input.idempotencyKey,last_request_hash:requestHash};
  const {data,error}=await db.from("contacts").insert(row).select(contactColumns).maybeSingle();
  if(!error&&data)return {...safeContact(data,true),replayed:false};
  if(error?.code==="23505"){
    const existing=await contactRow(db,teacherId,input.idempotencyKey);
    if(replay(existing,input.idempotencyKey,requestHash))return {...safeContact(existing,true),replayed:true};
    return fail(409,"IDEMPOTENCY_CONFLICT","Contact request ID was used for different details");
  }
  return dataError("Unable to create contact");
}
export async function contactUpdate(db:DB,teacherId:string,id:string,input:Update){
  const fields=mappedContact(input),requestHash=digest(["contact-update",id,input.expectedRevision,fields]);
  const {data,error}=await db.from("contacts").update({
    ...fields,revision:input.expectedRevision+1,last_request_id:input.idempotencyKey,
    last_request_hash:requestHash,updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",id).eq("revision",input.expectedRevision)
    .select(contactColumns).maybeSingle();
  if(error)return dataError("Unable to update contact");
  if(data)return {...safeContact(data,true),replayed:false};
  const existing=await contactRow(db,teacherId,id);
  if(replay(existing,input.idempotencyKey,requestHash))
    return {...safeContact(existing,true),replayed:true};
  return fail(409,"STALE_REVISION","Contact changed. Reload it before editing");
}
export async function studentContactsList(db:DB,teacherId:string,studentId:string){
  await requireStudent(db,teacherId,studentId);
  return (await paginated(db,"student_contacts",teacherId,linkColumns,studentId)).map(safeContactLink);
}
export async function studentContactLink(db:DB,teacherId:string,studentId:string,input:Link){
  await Promise.all([requireStudent(db,teacherId,studentId),
    requireActiveContact(db,teacherId,input.contactId)]);
  const fields={student_id:studentId,contact_id:input.contactId,
    relationship_label:input.relationshipLabel,is_legal_guardian:input.isLegalGuardian,
    may_receive_messages:input.mayReceiveMessages,
    emergency_priority:normalize(input.emergencyPriority),active_from:normalize(input.activeFrom)};
  const requestHash=digest(["student-contact-link",fields]);
  const {data,error}=await db.from("student_contacts").insert({
    id:input.idempotencyKey,teacher_id:teacherId,...fields,
    last_request_id:input.idempotencyKey,last_request_hash:requestHash,
  }).select(linkColumns).maybeSingle();
  if(!error&&data)return {...safeContactLink(data),replayed:false};
  if(error?.code==="23505"){
    const {data:old}=await db.from("student_contacts").select(linkColumns)
      .eq("id",input.idempotencyKey).eq("teacher_id",teacherId).maybeSingle();
    if(old&&replay(old,input.idempotencyKey,requestHash))
      return {...safeContactLink(old),replayed:true};
    return fail(409,"ALREADY_LINKED","Contact already linked or request ID reused");
  }
  return dataError("Unable to link student contact");
}
export async function studentContactUnlink(db:DB,teacherId:string,studentId:string,
  linkId:string,input:Unlink){
  const requestHash=digest(["student-contact-unlink",studentId,linkId,input.expectedRevision]);
  // A link may be scheduled for a future date. Closing it earlier than its
  // active_from would fail the historical-date constraint; preserve the
  // original effective start without backdating or erasing the relationship.
  const {data:current,error:currentError}=await db.from("student_contacts")
    .select("active_from").eq("teacher_id",teacherId)
    .eq("student_id",studentId).eq("id",linkId).maybeSingle();
  if(currentError)return dataError("Contact link lookup unavailable");
  if(!current)return fail(404,"NOT_FOUND","Contact link not found");
  const today=new Date().toISOString().slice(0,10);
  const endDate=typeof current.active_from==="string"&&current.active_from>today
    ? current.active_from : today;
  const {data,error}=await db.from("student_contacts").update({
    active_to:endDate,
    revision:input.expectedRevision+1,last_request_id:input.idempotencyKey,
    last_request_hash:requestHash,
  }).eq("teacher_id",teacherId).eq("student_id",studentId).eq("id",linkId)
    .eq("revision",input.expectedRevision).is("active_to",null)
    .select(linkColumns).maybeSingle();
  if(error)return dataError("Unable to unlink contact");
  if(data)return {...safeContactLink(data),replayed:false};
  const {data:old,error:lookupError}=await db.from("student_contacts").select(linkColumns)
    .eq("id",linkId).eq("student_id",studentId).eq("teacher_id",teacherId).maybeSingle();
  if(lookupError)return dataError("Link lookup unavailable");
  if(!old)return fail(404,"NOT_FOUND","Contact link not found");
  if(replay(old,input.idempotencyKey,requestHash))
    return {...safeContactLink(old),replayed:true};
  return fail(409,"STALE_REVISION","Link changed. Reload before unlinking");
}
export async function billingAccountsList(db:DB,teacherId:string){
  return (await paginated(db,"billing_accounts",teacherId,billingColumns))
    .map(row=>safeBillingAccount(row));
}
export async function billingAccountDetail(db:DB,teacherId:string,id:string){
  return billingRow(db,teacherId,id);
}
export async function billingAccountCreate(db:DB,teacherId:string,input:BillingCreate){
  if(input.contactId)await contactRow(db,teacherId,input.contactId);
  const fields=mappedBilling(input),requestHash=digest(["billing-create",fields]);
  const {data,error}=await db.from("billing_accounts").insert({
    id:input.idempotencyKey,teacher_id:teacherId,...fields,
    last_request_id:input.idempotencyKey,last_request_hash:requestHash,
  }).select(billingColumns).maybeSingle();
  if(!error&&data)return {...safeBillingAccount(data,true),replayed:false};
  if(error?.code==="23505"){
    const old=await billingRow(db,teacherId,input.idempotencyKey);
    if(replay(old,input.idempotencyKey,requestHash))
      return {...safeBillingAccount(old,true),replayed:true};
    return fail(409,"IDEMPOTENCY_CONFLICT","Billing account request ID reused");
  }
  return dataError("Unable to create billing account");
}
export async function billingAccountUpdate(db:DB,teacherId:string,id:string,input:BillingUpdate){
  if(input.contactId)await contactRow(db,teacherId,input.contactId);
  const fields=mappedBilling(input),
    requestHash=digest(["billing-update",id,input.expectedRevision,fields]);
  const {data,error}=await db.from("billing_accounts").update({
    ...fields,revision:input.expectedRevision+1,last_request_id:input.idempotencyKey,
    last_request_hash:requestHash,updated_at:new Date().toISOString(),
  }).eq("teacher_id",teacherId).eq("id",id).eq("revision",input.expectedRevision)
    .select(billingColumns).maybeSingle();
  if(error)return dataError("Unable to update billing account");
  if(data)return {...safeBillingAccount(data,true),replayed:false};
  const existing=await billingRow(db,teacherId,id);
  if(replay(existing,input.idempotencyKey,requestHash))
    return {...safeBillingAccount(existing,true),replayed:true};
  return fail(409,"STALE_REVISION","Billing account changed. Reload it before editing");
}
