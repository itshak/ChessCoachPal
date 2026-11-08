import type { SupabaseClient } from "@supabase/supabase-js";
import { insertGuardian, retireEmptyGuardians } from "@/lib/server/families";
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
  const {data,error}=await db.from("guardians").select(fields)
    .eq("teacher_id",teacherId).order("name").limit(1000);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to list families");
  return data??[];
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
export async function guardianCreate(db:Db,teacherId:string,input:GuardianChange){
  const name=input.name?.trim();
  if(!name)throw failure(400,"VALIDATION_ERROR","Family name required");
  const studentIds=input.studentIds??[];
  const members=await verifyStudents(db,teacherId,studentIds);
  const newRows=await checkNewStudents(db,teacherId,input);
  const {data:guardian,error}=await insertGuardian(db,teacherId,{
    name,familyName:input.familyName,email:input.email,phone:input.phone,
    secondaryName:input.secondaryName,secondaryEmail:input.secondaryEmail,
    secondaryPhone:input.secondaryPhone,emailRecipients:input.emailRecipients,
  });
  if(error||!guardian)throw failure(500,"DATABASE_ERROR","Unable to create family");
  // Child creation and assignment follow the existing website semantics.
  // Failure is visible instead of pretending that partial writes succeeded.
  if(studentIds.length){
    const {error:assignError}=await db.from("students").update({guardian_id:guardian.id})
      .eq("teacher_id",teacherId).in("id",studentIds);
    if(assignError)throw failure(500,"DATABASE_ERROR","Unable to assign family students");
  }
  if(newRows.length){
    const {error:childrenError}=await db.from("students").insert(newRows.map(x=>({...x,guardian_id:guardian.id})));
    if(childrenError)throw failure(500,"DATABASE_ERROR","Unable to create family students");
  }
  await retireEmptyGuardians(db,teacherId,members.map(x=>x.guardian_id)
    .filter((v):v is string=>typeof v==="string"&&v!==guardian.id));
  return guardian;
}
export async function guardianUpdate(db:Db,teacherId:string,id:string,input:GuardianChange){
  await guardianDetail(db,teacherId,id);
  const changeStudents=input.studentIds!==undefined;
  const members=changeStudents?await verifyStudents(db,teacherId,input.studentIds??[]):[];
  const newRows=await checkNewStudents(db,teacherId,input);
  const update:Record<string,unknown>={};
  if(input.name!==undefined)update.name=input.name.trim();
  if(input.familyName!==undefined)update.family_name=clean(input.familyName);
  if(input.email!==undefined)update.email=clean(input.email);
  if(input.phone!==undefined)update.phone=clean(input.phone);
  if(input.secondaryName!==undefined)update.secondary_name=clean(input.secondaryName);
  if(input.secondaryEmail!==undefined)update.secondary_email=clean(input.secondaryEmail);
  if(input.secondaryPhone!==undefined)update.secondary_phone=clean(input.secondaryPhone);
  if(input.emailRecipients!==undefined)update.email_recipients=input.emailRecipients;
  let guardian:Record<string,unknown>;
  if(Object.keys(update).length){
    const {data,error}=await db.from("guardians").update(update)
      .eq("id",id).eq("teacher_id",teacherId).select().maybeSingle();
    if(error)throw failure(500,"DATABASE_ERROR","Unable to edit family");
    if(!data)throw failure(404,"NOT_FOUND","Family not found");
    guardian=data;
  }else guardian=await guardianDetail(db,teacherId,id);
  if(changeStudents){
    const {error:detachError}=await db.from("students").update({guardian_id:null})
      .eq("teacher_id",teacherId).eq("guardian_id",id);
    if(detachError)throw failure(500,"DATABASE_ERROR","Unable to update family members");
    if(members.length){
      const {error:assignError}=await db.from("students").update({guardian_id:id})
        .eq("teacher_id",teacherId).in("id",members.map(x=>x.id));
      if(assignError)throw failure(500,"DATABASE_ERROR","Unable to assign family members");
    }
    await retireEmptyGuardians(db,teacherId,members.map(x=>x.guardian_id)
      .filter((v):v is string=>typeof v==="string"&&v!==id));
  }
  if(newRows.length){
    const {error}=await db.from("students").insert(newRows.map(x=>({...x,guardian_id:id})));
    if(error)throw failure(500,"DATABASE_ERROR","Unable to create family students");
  }
  return guardian;
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
