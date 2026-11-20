import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "@/lib/supabase/types";
import {teacherStudentProfile,StudentProfileError} from "./student-profile-service";

/** Payer selection requires an explicit teacher-attested contract. Never infer
 * debt from a contact relation, household, student enrollment or portal grant. */
const uuid=z.uuid();
const date=z.iso.date();
export const payerAssignmentCreateSchema=z.object({
 studentId:uuid,workplaceId:uuid,billingAccountId:uuid,
 effectiveFrom:date,effectiveTo:date.nullable().default(null),
 idempotencyKey:uuid,confirmed:z.literal(true),
}).strict().refine(x=>x.effectiveTo===null||x.effectiveTo>=x.effectiveFrom,
 "Effective end must not be before start");
export const payerAssignmentEndSchema=z.object({
 studentId:uuid,assignmentId:uuid,expectedRevision:z.number().int().min(1),
 effectiveTo:date,idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const payerAssignmentListSchema=z.object({
 studentId:uuid,workplaceId:uuid.optional(),
}).strict();
export class PayerAssignmentError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string):never=>{
 throw new PayerAssignmentError(status,code,message);
};
type Db=SupabaseClient;
type Row=Omit<Database["public"]["Tables"]["student_billing_assignments"]["Row"],"teacher_id">;
const columns="id,student_id,workplace_id,billing_account_id,effective_from,effective_to,revision,last_request_id,last_request_hash,created_at,updated_at";
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function safe(r:Row){
 return {id:r.id,studentId:r.student_id,workplaceId:r.workplace_id,
  billingAccountId:r.billing_account_id,effectiveFrom:r.effective_from,
  effectiveTo:r.effective_to,revision:Number(r.revision),
  createdAt:r.created_at,updatedAt:r.updated_at};
}
async function checkStudent(db:Db,teacherId:string,studentId:string){
 try{return await teacherStudentProfile(db,teacherId,studentId);}
 catch(error){
  if(error instanceof StudentProfileError)
   return fail(error.status,error.code,error.message);
  throw error;
 }
}
async function checkOwner(db:Db,teacherId:string,table:string,id:string){
 const {data,error}=await db.from(table).select("id,status")
  .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
 if(error)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Related account lookup failed");
 if(!data)return fail(404,"NOT_FOUND","Related entity is not owned by this teacher");
 return data;
}
export async function payerAssignmentsList(db:Db,teacherId:string,
 raw:z.infer<typeof payerAssignmentListSchema>){
 const x=payerAssignmentListSchema.parse(raw);
 await checkStudent(db,teacherId,x.studentId);
 let query=db.from("student_billing_assignments").select(columns)
  .eq("teacher_id",teacherId).eq("student_id",x.studentId)
  .order("effective_from",{ascending:false}).order("id")
  .limit(500);
 if(x.workplaceId)query=query.eq("workplace_id",x.workplaceId);
 const {data,error}=await query;
 if(error)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Could not read student payers");
 if((data??[]).length===500)fail(413,"TOO_MANY_ASSIGNMENTS","Use a narrower workplace filter");
 return {studentId:x.studentId,assignments:(data??[]).map(safe)};
}
export async function payerAssignmentCreate(db:Db,teacherId:string,
 raw:z.infer<typeof payerAssignmentCreateSchema>){
 const x=payerAssignmentCreateSchema.parse(raw);
 await checkStudent(db,teacherId,x.studentId);
 const workplace=await db.from("workplaces").select("id").eq("teacher_id",teacherId)
   .eq("id",x.workplaceId).maybeSingle();
 if(workplace.error)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Workplace lookup failed");
 if(!workplace.data)fail(404,"NOT_FOUND","Workplace not owned by teacher");
 // Replays keep their original receipt even if enrollment subsequently ended.
 // New contracts must fit inside a single reviewed dated enrollment period.
 const fields={teacher_id:teacherId,student_id:x.studentId,
  workplace_id:x.workplaceId,billing_account_id:x.billingAccountId,
  effective_from:x.effectiveFrom,effective_to:x.effectiveTo};
 const digest=hash(fields);
 const {data:existing,error:existingError}=await db.from("student_billing_assignments")
  .select(columns).eq("teacher_id",teacherId).eq("id",x.idempotencyKey).maybeSingle();
 if(existingError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot verify prior payer request");
 if(existing){
  if(existing.last_request_id===x.idempotencyKey&&existing.last_request_hash===digest)
   return {...safe(existing),replayed:true};
  fail(409,"PAYER_OVERLAP","Request ID was already used for different payer terms");
 }
 let enrollment=db.from("workplace_enrollments").select("id")
  .eq("teacher_id",teacherId).eq("student_id",x.studentId)
  .eq("workplace_id",x.workplaceId).eq("start_date_unknown",false)
  .is("cancelled_at",null).lte("starts_on",x.effectiveFrom);
 if(x.effectiveTo===null)enrollment=enrollment.is("ends_on",null);
 else enrollment=enrollment.or(`ends_on.is.null,ends_on.gte.${x.effectiveTo}`);
 const {data:enrolled,error:enrollError}=await enrollment.limit(1).maybeSingle();
 if(enrollError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Enrollment lookup failed");
 if(!enrolled)fail(409,"PAYER_ENROLLMENT_RANGE_REQUIRED",
  "Payer dates must fit within one verified workplace enrollment period");
 const payer=await checkOwner(db,teacherId,"billing_accounts",x.billingAccountId);
 if(payer.status!=="active")fail(409,"PAYER_ARCHIVED","Payer account is not active");
 const {data,error}=await db.from("student_billing_assignments").insert({
  id:x.idempotencyKey,...fields,last_request_id:x.idempotencyKey,last_request_hash:digest,
 }).select(columns).maybeSingle();
 if(!error&&data)return {...safe(data),replayed:false};
 if(error?.code==="23503")fail(409,"PAYER_ENROLLMENT_RANGE_REQUIRED",
  "Payer dates are no longer covered by an eligible enrollment");
 if(error?.code==="23505"){
  const {data:prior,error:readError}=await db.from("student_billing_assignments")
   .select(columns).eq("teacher_id",teacherId).eq("id",x.idempotencyKey).maybeSingle();
  if(readError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Unable to check payer replay");
  if(prior&&prior.last_request_id===x.idempotencyKey&&prior.last_request_hash===digest)
   return {...safe(prior),replayed:true};
  fail(409,"PAYER_OVERLAP","Student has an existing payer in this workplace on these dates");
 }
 return fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Unable to assign payer");
}
export async function payerAssignmentEnd(db:Db,teacherId:string,
 raw:z.infer<typeof payerAssignmentEndSchema>){
 const x=payerAssignmentEndSchema.parse(raw);
 await checkStudent(db,teacherId,x.studentId);
 const {data:before,error:readError}=await db.from("student_billing_assignments")
  .select(columns).eq("teacher_id",teacherId).eq("student_id",x.studentId)
  .eq("id",x.assignmentId).maybeSingle();
 if(readError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot inspect existing payer");
 if(!before)return fail(404,"NOT_FOUND","Assignment is not owned by this student");
 if(x.effectiveTo<before.effective_from||
   (before.effective_to!==null&&x.effectiveTo>before.effective_to))
  fail(409,"INVALID_END_DATE","Cannot end before start or extend a closed historical payer range");
 const digest=hash([x.assignmentId,x.studentId,x.expectedRevision,x.effectiveTo]);
 const {data,error}=await db.from("student_billing_assignments").update({
  effective_to:x.effectiveTo,revision:x.expectedRevision+1,
  updated_at:new Date().toISOString(),last_request_id:x.idempotencyKey,
  last_request_hash:digest,
 }).eq("teacher_id",teacherId).eq("student_id",x.studentId)
   .eq("id",x.assignmentId).eq("revision",x.expectedRevision)
   .select(columns).maybeSingle();
 if(error?.code==="23505")fail(409,"PAYER_OVERLAP","Payer period overlaps another assignment");
 if(error?.code==="23503")fail(409,"PAYER_ENROLLMENT_RANGE_REQUIRED",
  "Payer end date must fit within its verified enrollment");
 if(error?.code==="23514")fail(409,"INVALID_END_DATE",
  "Payer history may only be shortened, not reassigned or extended");
 if(error)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot end payer assignment");
 if(data)return {...safe(data),replayed:false};
 const {data:latest,error:laterError}=await db.from("student_billing_assignments")
  .select(columns).eq("teacher_id",teacherId).eq("id",x.assignmentId).maybeSingle();
 if(laterError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot verify payer ending replay");
 if(latest?.last_request_id===x.idempotencyKey&&latest.last_request_hash===digest)
  return {...safe(latest),replayed:true};
 return fail(409,"STALE_REVISION","Payer assignment changed; reload before editing");
}
/** Fail-closed as-of-date resolution; never fallback to student contact. */
export async function payerForStudentAt(db:Db,teacherId:string,
 studentId:string,workplaceId:string,localDate:string):Promise<string|null>{
 if(!z.iso.date().safeParse(localDate).success)
  fail(400,"INVALID_DATE","Use an exact local lesson date");
 // A payer alone is not authority to bill a lesson after enrollment ended.
 const {data:enrolled,error:enrollError}=await db.from("workplace_enrollments")
  .select("id").eq("teacher_id",teacherId).eq("student_id",studentId)
  .eq("workplace_id",workplaceId).eq("start_date_unknown",false)
  .is("cancelled_at",null).lte("starts_on",localDate)
  .or(`ends_on.is.null,ends_on.gte.${localDate}`).limit(1).maybeSingle();
 if(enrollError)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot verify dated enrollment");
 if(!enrolled)return null;
 const {data,error}=await db.from("student_billing_assignments")
  .select("billing_account_id").eq("teacher_id",teacherId)
  .eq("student_id",studentId).eq("workplace_id",workplaceId)
  .lte("effective_from",localDate)
  .or(`effective_to.is.null,effective_to.gte.${localDate}`)
  .limit(2);
 if(error)fail(503,"PAYER_ASSIGNMENT_UNAVAILABLE","Cannot resolve current payer");
 if((data??[]).length>1)fail(409,"AMBIGUOUS_PAYER","More than one payer matched; no charge will be generated");
 return data?.[0]?.billing_account_id??null;
}
