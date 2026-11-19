import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {canonicalCalendarWindow} from "./canonical-calendar-read";
import {calculateExpectedCompensation,type CompensationAgreement,
  type CompensationOccurrence} from "@/lib/coaching-compensation";
import {toLocalDateString} from "@/lib/schedule";

/** Approved terms are business policies, never payment postings or invoices. */
const uuid=z.string().uuid();
const date=z.iso.date();
const model=z.enum(["hourly","per_session","per_student","fixed_period"]);
const role=z.enum(["coach_earning","participant_charge"]);
const rate=z.number().int().min(0).max(1000000000);
const agreementFields=z.object({
  workplaceId:uuid,
  studentId:uuid.nullable().default(null),groupId:uuid.nullable().default(null),
  billingAccountId:uuid,
  agreementRole:role,model,rateCents:rate,
  currency:z.string().regex(/^[A-Z]{3}$/),
  effectiveFrom:date,effectiveTo:date.nullable().default(null),
  status:z.enum(["active","archived"]).default("active"),
}).strict().superRefine((value,ctx)=>{
  if(value.studentId&&value.groupId)
    ctx.addIssue({code:"custom",path:["studentId"],message:"Choose student or group, not both"});
  // Both coach earnings and participant charges require a separately owned
  // financial counterparty. A workplace/student/contact is not a debtor.
  if(value.effectiveTo&&value.effectiveTo<value.effectiveFrom)
    ctx.addIssue({code:"custom",path:["effectiveTo"],message:"Effective end is before start"});
});
export const compensationAgreementCreateSchema=agreementFields.safeExtend({
  idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const compensationAgreementUpdateSchema=z.object({
  id:uuid,expectedRevision:z.number().int().min(1),
  changes:z.object({
    rateCents:rate.optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),
    effectiveFrom:date.optional(),effectiveTo:date.nullable().optional(),
    status:z.enum(["active","archived"]).optional(),
  }).strict().refine(x=>Object.keys(x).length>0,"No changes supplied"),
  idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const compensationPreviewSchema=z.object({
  agreementId:uuid,from:date,to:date,
}).strict();
export class CompensationAgreementError extends Error{
  constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
  throw new CompensationAgreementError(status,code,message);
};
type Db=SupabaseClient;
type RecordRow=Record<string,unknown>;
const cols="id,teacher_id,workplace_id,student_id,group_id,billing_account_id,agreement_role,model,rate_cents,currency,effective_from,effective_to,status,revision,created_at,updated_at,last_request_id,last_request_hash";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function safeCompensationAgreement(row:RecordRow){
  return {id:row.id,workplaceId:row.workplace_id,studentId:row.student_id,
    groupId:row.group_id,billingAccountId:row.billing_account_id,
    agreementRole:row.agreement_role,model:row.model,rateCents:Number(row.rate_cents),
    currency:row.currency,effectiveFrom:row.effective_from,effectiveTo:row.effective_to,
    status:row.status,revision:Number(row.revision),createdAt:row.created_at,
    updatedAt:row.updated_at};
}
const map=(value:Record<string,unknown>)=>{
  const out:RecordRow={};
  const names:Record<string,string>={workplaceId:"workplace_id",studentId:"student_id",
    groupId:"group_id",billingAccountId:"billing_account_id",
    agreementRole:"agreement_role",rateCents:"rate_cents",effectiveFrom:"effective_from",
    effectiveTo:"effective_to"};
  for(const [key,v] of Object.entries(value))
    if(!["id","idempotencyKey","confirmed","expectedRevision"].includes(key))
      out[names[key]??key]=v;
  return out;
};
async function get(db:Db,teacherId:string,id:string):Promise<RecordRow>{
  const {data,error}=await db.from("compensation_agreements").select(cols)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Cannot read compensation terms");
  if(!data)fail(404,"NOT_FOUND","Compensation agreement not found");
  return data as unknown as RecordRow;
}
async function owned(db:Db,teacherId:string,table:string,id:string,cols="id"){
  const {data,error}=await db.from(table).select(cols)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)fail(500,"DATABASE_ERROR","Cannot verify agreement scope");
  if(!data)fail(404,"NOT_FOUND","Related agreement entity is not available");
  return data as unknown as RecordRow;
}
async function authorizeTerms(db:Db,teacherId:string,value:z.infer<typeof agreementFields>){
  const workplace=await owned(db,teacherId,"workplaces",value.workplaceId,"id,currency");
  if(workplace.currency!==value.currency)
    fail(409,"CURRENCY_MISMATCH","Agreement currency must match the workplace; no implicit exchange-rate calculation");
  if(value.studentId){
    await owned(db,teacherId,"students",value.studentId);
    const {data,error}=await db.from("workplace_enrollments").select("id")
      .eq("teacher_id",teacherId).eq("workplace_id",value.workplaceId)
      .eq("student_id",value.studentId).limit(1).maybeSingle();
    if(error)fail(500,"DATABASE_ERROR","Cannot inspect student enrollment");
    if(!data)fail(409,"NOT_ENROLLED","Student is not in the selected workplace");
  }
  if(value.groupId){
    const group=await owned(db,teacherId,"class_groups",value.groupId,"id,workplace_id");
    if(group.workplace_id!==value.workplaceId)
      fail(409,"GROUP_WORKPLACE_MISMATCH","Group belongs to a different workplace");
  }
  const account=await owned(db,teacherId,"billing_accounts",value.billingAccountId,"id,status");
  if(account.status!=="active"&&value.status==="active")
    fail(409,"PAYER_ARCHIVED","Billing account must be active for new or active agreements");
}
export async function compensationAgreementsList(db:Db,teacherId:string,
  opts:{workplaceId?:string;includeArchived?:boolean}={}){
  const results:ReturnType<typeof safeCompensationAgreement>[]=[];
  for(let offset=0;offset<=20000;offset+=500){
    let q=db.from("compensation_agreements").select(cols).eq("teacher_id",teacherId)
      .order("effective_from",{ascending:false}).order("id").range(offset,offset+499);
    if(opts.workplaceId)q=q.eq("workplace_id",opts.workplaceId);
    if(!opts.includeArchived)q=q.eq("status","active");
    const {data,error}=await q;
    if(error)fail(500,"DATABASE_ERROR","Cannot list compensation agreements");
    results.push(...(data??[]).map(safeCompensationAgreement));
    if((data??[]).length<500)return results;
  }
  return fail(413,"TOO_MANY_AGREEMENTS","Too many compensation agreements to list");
}
export async function compensationAgreementGet(db:Db,teacherId:string,id:string){
  return safeCompensationAgreement(await get(db,teacherId,id));
}
export async function compensationAgreementCreate(db:Db,teacherId:string,
  input:z.input<typeof compensationAgreementCreateSchema>){
  const value=compensationAgreementCreateSchema.parse(input);
  await authorizeTerms(db,teacherId,value);
  const data=map(value),requestHash=hash(["compensation-create",data]);
  const {data:created,error}=await db.from("compensation_agreements").insert({
    id:value.idempotencyKey,teacher_id:teacherId,...data,
    last_request_id:value.idempotencyKey,last_request_hash:requestHash,
  }).select(cols).maybeSingle();
  if(!error&&created)return {...safeCompensationAgreement(created),replayed:false};
  if(error?.code==="23505"){
    const {data:old}=await db.from("compensation_agreements").select(cols)
      .eq("id",value.idempotencyKey).eq("teacher_id",teacherId).maybeSingle();
    if(old&&old.last_request_id===value.idempotencyKey&&old.last_request_hash===requestHash)
      return {...safeCompensationAgreement(old),replayed:true};
    fail(409,"AGREEMENT_CONFLICT","Conflicting overlapping agreement or reused request ID");
  }
  return fail(500,"DATABASE_ERROR","Cannot create compensation agreement");
}
export async function compensationAgreementUpdate(db:Db,teacherId:string,
  input:z.infer<typeof compensationAgreementUpdateSchema>){
  const value=compensationAgreementUpdateSchema.parse(input);
  const current=await get(db,teacherId,value.id);
  const proposed={
    workplaceId:String(current.workplace_id),
    studentId:current.student_id?String(current.student_id):null,
    groupId:current.group_id?String(current.group_id):null,
    billingAccountId:String(current.billing_account_id),
    agreementRole:current.agreement_role,
    model:current.model,
    rateCents:value.changes.rateCents??Number(current.rate_cents),
    currency:value.changes.currency??String(current.currency),
    effectiveFrom:value.changes.effectiveFrom??String(current.effective_from),
    effectiveTo:value.changes.effectiveTo===undefined?
      (current.effective_to?String(current.effective_to):null):value.changes.effectiveTo,
    status:value.changes.status??current.status,
  };
  const validation=agreementFields.safeParse(proposed);
  if(!validation.success)fail(400,"VALIDATION_ERROR","Invalid agreement revision");
  await authorizeTerms(db,teacherId,validation.data!);
  const fields=map(value.changes);
  const requestHash=hash(["compensation-update",value.id,value.expectedRevision,fields]);
  const {data:updated,error}=await db.from("compensation_agreements").update({
    ...fields,revision:value.expectedRevision+1,updated_at:new Date().toISOString(),
    last_request_id:value.idempotencyKey,last_request_hash:requestHash,
  }).eq("teacher_id",teacherId).eq("id",value.id).eq("revision",value.expectedRevision)
    .select(cols).maybeSingle();
  if(error?.code==="23505")fail(409,"AGREEMENT_CONFLICT","Overlapping compensation agreement");
  if(error?.code==="23514"&&error.message.includes("POSTED_COMPENSATION_HISTORY_IMMUTABLE"))
    fail(409,"POSTED_FINANCIAL_HISTORY","The agreement has posted obligations; end it after the final posting and create a new future-dated agreement");
  if(error)fail(500,"DATABASE_ERROR","Cannot update compensation terms");
  if(updated)return {...safeCompensationAgreement(updated),replayed:false};
  const old=await get(db,teacherId,value.id);
  if(old.last_request_id===value.idempotencyKey&&old.last_request_hash===requestHash)
    return {...safeCompensationAgreement(old),replayed:true};
  return fail(409,"STALE_REVISION","Compensation terms changed; reload to edit");
}
export async function compensationAgreementPreview(db:Db,teacherId:string,
  input:z.infer<typeof compensationPreviewSchema>){
  const value=compensationPreviewSchema.parse(input);
  if(value.from>value.to||Date.parse(value.to)-Date.parse(value.from)>366*86400000)
    fail(400,"INVALID_DATE_RANGE","Preview range must be at most 366 days");
  const row=await get(db,teacherId,value.agreementId);
  const terms=safeCompensationAgreement(row);
  if(terms.status!=="active")fail(409,"AGREEMENT_ARCHIVED","Archived agreement is not used for current previews");
  const workplace=await owned(db,teacherId,"workplaces",String(terms.workplaceId),"timezone");
  const rows=await canonicalCalendarWindow(db,teacherId,value.from,value.to,String(workplace.timezone));
  const scoped=rows.filter(s=>s.workplace_id===terms.workplaceId&&
    (!terms.studentId||s.participants.some(p=>p.studentId===terms.studentId)));
  let groupIds:Map<string,string|null>|null=null;
  if(terms.groupId){
    groupIds=new Map();
    for(let offset=0;offset<scoped.length;offset+=100){
      const ids=scoped.slice(offset,offset+100).map(s=>s.id);
      if(!ids.length)continue;
      const {data,error}=await db.from("teaching_sessions")
        .select("id,group_id").eq("teacher_id",teacherId).in("id",ids);
      if(error)fail(500,"DATABASE_ERROR","Cannot verify session group attribution");
      for(const x of data??[])groupIds.set(x.id,x.group_id);
    }
  }
  if(terms.model==="fixed_period"){
    const year=Number(value.from.slice(0,4)),month=Number(value.from.slice(5,7));
    const lastDay=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
    if(!value.from.endsWith("-01")||value.to!==lastDay)
      fail(400,"FIXED_PERIOD_MONTH_REQUIRED",
        "Fixed monthly compensation can be previewed only for a complete calendar month");
  }
  const occurrences:CompensationOccurrence[]=scoped.filter(s=>
    !groupIds||groupIds.get(s.id)===terms.groupId).map(s=>({
    id:s.id,workplaceId:s.workplace_id,
    lessonDate:toLocalDateString(new Date(s.starts_at),s.local_timezone||String(workplace.timezone)),
    durationMinutes:s.duration_minutes,
    status:s.status as CompensationOccurrence["status"],
    participantIds:s.participants.map(p=>p.studentId),
    markedStudentIds:s.participants.filter(p=>
      ["present","late","absent","excused","student_cancelled","teacher_cancelled"]
      .includes(p.attendanceStatus??"")).map(p=>p.studentId),
    attendedStudentIds:s.participants.filter(p=>["present","late"].includes(p.attendanceStatus??"")&&
      (!terms.studentId||p.studentId===terms.studentId)).map(p=>p.studentId),
  }));
  const agreement:CompensationAgreement={
    id:String(terms.id),workplaceId:String(terms.workplaceId),
    model:terms.model as CompensationAgreement["model"],
    rateCents:terms.rateCents,currency:String(terms.currency),
    effectiveFrom:String(terms.effectiveFrom),
    effectiveTo:terms.effectiveTo?String(terms.effectiveTo):null,
    ...(terms.model==="fixed_period"?{periodStart:value.from,periodEnd:value.to}:{}),
  };
  try{
    return {agreement:terms,projection:calculateExpectedCompensation(
      agreement,occurrences,value.from,value.to),
      explanation:terms.agreementRole==="coach_earning"?
        "Expected coach compensation from verified lessons or an agreed fixed monthly period; not paid money or payroll.":
        "Expected participant charges from verified lessons; not an invoice, customer debt posting or received payment.",
      persistedObligation:false,paymentRecorded:false};
  }catch(error){
    if(error instanceof RangeError||error instanceof TypeError||error instanceof Error)
      fail(400,"INVALID_COMPENSATION_INPUT",error.message);
    throw error;
  }
}
