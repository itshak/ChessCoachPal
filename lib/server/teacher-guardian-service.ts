import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWithinHostedLimit, limitReachedResponse } from "@/lib/server/entitlements";
import { generateShortToken } from "@/lib/token";

type Db = SupabaseClient;
type MemberInput={name:string;birthdate?:string|null};
export type GuardianChange={
  name?:string;familyName?:string|null;email?:string|null;phone?:string|null;
  secondaryName?:string|null;secondaryEmail?:string|null;secondaryPhone?:string|null;
  emailRecipients?:"primary"|"secondary"|"both";
  studentIds?:string[];newStudents?:MemberInput[];
};
export class GuardianServiceError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(status:number,code:string,message:string)=>new GuardianServiceError(status,code,message);
const fields="id,name,family_name,email,phone,secondary_name,secondary_email,secondary_phone,email_recipients,portal_token,created_at,students ( id, name )";
/** Same teacher-scoped query as the website family list. Never leak portal_token to MCP. */
export async function guardiansList(db:Db,teacherId:string) {
  const rows:Record<string,unknown>[]=[];
  const size=500,maxRows=20_000;
  for(let offset=0;;offset+=size){
    // Stable tie-breaker avoids silently omitting names at the page boundary.
    const {data,error}=await db.from("guardians").select(fields)
      .eq("teacher_id",teacherId).order("name").order("id")
      .range(offset,offset+size-1);
    if(error)throw failure(500,"DATABASE_ERROR","Unable to list families");
    const page=data??[];
    if(rows.length+page.length>maxRows)
      throw failure(413,"ROSTER_TOO_LARGE","Family roster exceeds safe listing size");
    rows.push(...page);
    if(page.length<size)break;
  }
  return rows;
}
export async function guardianDetail(db:Db,teacherId:string,id:string) {
  const {data,error}=await db.from("guardians").select(fields)
    .eq("teacher_id",teacherId).eq("id",id).maybeSingle();
  if(error)throw failure(500,"DATABASE_ERROR","Unable to view family");
  if(!data)throw failure(404,"NOT_FOUND","Family not found");
  return data;
}
export function safeGuardian(row:Record<string,unknown>,includeContact=false) {
  const {id,name,family_name,created_at,students,email,phone,secondary_name,
    secondary_email,secondary_phone,email_recipients}=row;
  return includeContact?{id,name,family_name,created_at,students,email,phone,secondary_name,
    secondary_email,secondary_phone,email_recipients}:{id,name,family_name,created_at,students};
}
async function verifyStudents(db:Db,teacherId:string,ids:string[]) {
  if(!ids.length)return [];
  const distinct=[...new Set(ids)];
  if(distinct.length!==ids.length)throw failure(400,"VALIDATION_ERROR","Duplicate student IDs");
  const {data,error}=await db.from("students").select("id,guardian_id")
    .eq("teacher_id",teacherId).in("id",distinct);
  if(error)throw failure(500,"DATABASE_ERROR","Family student lookup unavailable");
  if(data?.length!==distinct.length)throw failure(404,"NOT_FOUND","A student is not owned by this teacher");
  return data;
}
async function checkNewStudents(db:Db,teacherId:string,input:GuardianChange) {
  const rows=(input.newStudents??[]).filter(x=>x.name.trim()).map(x=>({
    teacher_id:teacherId,name:x.name.trim(),birthdate:x.birthdate||null,
  }));
  if(rows.length>0) {
    const check=await assertWithinHostedLimit(db,teacherId,"students",rows.length);
    if(!check.allowed){
      const result=limitReachedResponse(check);
      throw failure(403,result.code,result.error);
    }
  }
  return rows;
}
function clean(v:string|null|undefined){return v?.trim()||null;}
/** Shared tenant-locked transactional mutation for website and delegated MCP. */
function guardianFields(input:GuardianChange):Record<string,unknown>{
  const result:Record<string,unknown>={};
  if(input.name!==undefined)result.name=input.name.trim();
  if(input.familyName!==undefined)result.family_name=clean(input.familyName);
  if(input.email!==undefined)result.email=clean(input.email);
  if(input.phone!==undefined)result.phone=clean(input.phone);
  if(input.secondaryName!==undefined)result.secondary_name=clean(input.secondaryName);
  if(input.secondaryEmail!==undefined)result.secondary_email=clean(input.secondaryEmail);
  if(input.secondaryPhone!==undefined)result.secondary_phone=clean(input.secondaryPhone);
  if(input.emailRecipients!==undefined)result.email_recipients=input.emailRecipients;
  return result;
}
async function writeGuardian(
  db:Db,teacherId:string,guardianId:string|null,input:GuardianChange,
){
  const existing=input.studentIds??[];
  // Helpful early errors; the database independently repeats the ownership
  // and quota checks while locked, before committing any roster mutation.
  if(input.studentIds!==undefined)await verifyStudents(db,teacherId,existing);
  const newRows=await checkNewStudents(db,teacherId,input);
  const {data,error}=await db.rpc("ccp_guardian_save",{
    p_guardian_id:guardianId,p_fields:guardianFields(input),
    p_student_ids:existing,p_replace_members:input.studentIds!==undefined,
    p_new_students:newRows.map(x=>({name:x.name,birthdate:x.birthdate})),
  });
  if(error){
    if(error.message.includes("HOSTED_LIMIT_REACHED"))
      throw failure(403,"HOSTED_LIMIT_REACHED","Active-student capacity reached");
    if(error.message.includes("NOT_FOUND"))
      throw failure(404,"NOT_FOUND","Family or student not found");
    if(error.code==="22023"||error.code==="23514")
      throw failure(400,"VALIDATION_ERROR","Invalid family or student details");
    throw failure(500,"DATABASE_ERROR","Unable to save family and student roster");
  }
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw failure(500,"DATABASE_ERROR","Family transaction returned an invalid receipt");
  return data as Record<string,unknown>;
}
export async function guardianCreate(db:Db,teacherId:string,input:GuardianChange){
  if(!input.name?.trim())throw failure(400,"VALIDATION_ERROR","Family name required");
  return writeGuardian(db,teacherId,null,input);
}
export async function guardianUpdate(db:Db,teacherId:string,id:string,input:GuardianChange){
  return writeGuardian(db,teacherId,id,input);
}
export async function guardianDeleteImpact(db:Db,teacherId:string,id:string){
  await guardianDetail(db,teacherId,id);
  const [{count:students,error:studentError},{count:invoices,error:invoiceError}]=await Promise.all([
    db.from("students").select("id",{count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("guardian_id",id),
    db.from("invoices").select("id",{count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("guardian_id",id),
  ]);
  if(studentError||invoiceError)throw failure(500,"DATABASE_ERROR","Family impact unavailable");
  return {guardianId:id,studentCount:students??0,invoiceCount:invoices??0};
}
export async function guardianDelete(db:Db,teacherId:string,id:string){
  const impact=await guardianDeleteImpact(db,teacherId,id);
  if(impact.studentCount||impact.invoiceCount)
    throw failure(409,"CONFLICT","Unlink students and resolve invoices before permanently deleting this family");
  const {error}=await db.from("guardians").delete().eq("id",id).eq("teacher_id",teacherId);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to delete family");
  return {ok:true};
}
/** Website can display the new portal credential; MCP MUST redact it. */
export async function guardianRotatePortalToken(db:Db,teacherId:string,id:string){
  const {data,error}=await db.from("guardians")
    .update({portal_token:generateShortToken()})
    .eq("teacher_id",teacherId).eq("id",id)
    .select("id,portal_token").maybeSingle();
  if(error)throw failure(500,"DATABASE_ERROR","Unable to rotate family portal link");
  if(!data)throw failure(404,"NOT_FOUND","Family not found");
  return data;
}
