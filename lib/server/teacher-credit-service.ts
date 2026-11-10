import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy } from "@/lib/server/scheduling";
import { loadCreditBalances, loadCreditPackages } from "@/lib/server/credits";
import { validateCreditPackage } from "@/lib/credits";
import { oneToOne,toLocalDateString } from "@/lib/schedule";
type Db=SupabaseClient;
export class CreditServiceError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(s:number,c:string,m:string)=>new CreditServiceError(s,c,m);
export type CreateCreditInput={studentId:string;credits:number;durationMinutes:number;
 priceCents:number;startsOn?:string;expiresOn?:string|null;requestId?:string};
export async function teacherCreditPackagesList(db:Db,teacherId:string,studentId?:string){
 const policy=await getPolicy(db,teacherId);
 const today=toLocalDateString(new Date(),policy.timezone);
 if(studentId){
  const {data,error}=await db.from("students").select("id").eq("id",studentId).eq("teacher_id",teacherId).maybeSingle();
  if(error)throw fail(500,"DATABASE_ERROR","Unable to find student");
  if(!data)throw fail(404,"NOT_FOUND","Student not found");
  return {packages:await loadCreditBalances(db,teacherId,policy,[studentId],today)};
 }
 return {packages:await loadCreditPackages(db,teacherId)};
}
/**
 * Purchase package, invoice and invoice line in ONE authenticated SQL
 * transaction. The RPC derives teacher ownership and studio currency from
 * auth.uid() rather than trusting browser/MCP financial or tenant claims.
 */
export async function teacherCreditPackageCreate(db:Db,teacherId:string,input:CreateCreditInput){
 const policy=await getPolicy(db,teacherId);
 const today=toLocalDateString(new Date(),policy.timezone);
 const request={
  credits:input.credits,durationMinutes:input.durationMinutes,priceCents:input.priceCents,
  startsOn:input.startsOn??today,expiresOn:input.expiresOn||null,
 };
 const invalid=validateCreditPackage(request);
 if(invalid)throw fail(400,"VALIDATION_ERROR",invalid);
 const {data,error}=await db.rpc("ccp_credit_package_create",{
  p_student_id:input.studentId,
  p_credits:request.credits,
  p_duration_minutes:request.durationMinutes,
  p_price_cents:request.priceCents,
  p_starts_on:request.startsOn,
  p_expires_on:request.expiresOn,
  p_request_id:input.requestId??null,
 });
 if(error){
  if(error.message.includes("CREDIT_REQUEST_CONFLICT"))
    throw fail(409,"CONFLICT","This request ID was already used for different package terms");
  if(error.message.includes("ARCHIVED_STUDENT"))
    throw fail(409,"ARCHIVED","Reactivate student before selling prepaid lessons");
  if(error.message.includes("FAMILY_REQUIRED"))
    throw fail(400,"VALIDATION_ERROR","Link the student to a family before selling credits");
  if(error.message.includes("INVALID_CREDIT_PACKAGE"))
    throw fail(400,"VALIDATION_ERROR","Invalid prepaid package terms");
  if(/NOT_FOUND|POLICY_NOT_FOUND/.test(error.message))
    throw fail(404,"NOT_FOUND","Student, family or studio policy not found");
  throw fail(500,"DATABASE_ERROR","Prepaid package could not be created; no partial invoice was left behind");
 }
 return data as {packageId:string;invoiceId:string;replayed:boolean};
}
export async function teacherCreditPackageExpiry(db:Db,teacherId:string,id:string,expiresOn:string|null){
 const {data:existing,error:lookup}=await db.from("credit_packages")
  .select("id,starts_on,credit_redemptions(lessons(lesson_date))")
  .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
 if(lookup)throw fail(500,"DATABASE_ERROR","Unable to load package");
 if(!existing)throw fail(404,"NOT_FOUND","Prepaid package not found");
 if(expiresOn&&!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn))
  throw fail(400,"VALIDATION_ERROR","Expiry date must be YYYY-MM-DD");
 if(expiresOn&&expiresOn<existing.starts_on)
  throw fail(400,"VALIDATION_ERROR","Expiry cannot precede package start");
 const usedDates=((existing.credit_redemptions??[]) as {
  lessons:{lesson_date:string}|{lesson_date:string}[]|null;
 }[]).flatMap(x=>oneToOne(x.lessons)?.lesson_date??[]);
 const latest=usedDates.sort().at(-1);
 if(expiresOn&&latest&&expiresOn<latest)
  throw fail(409,"CONFLICT",`A credit was used for a lesson on ${latest}`);
 const {error}=await db.from("credit_packages").update({expires_on:expiresOn})
  .eq("id",id).eq("teacher_id",teacherId);
 if(error)throw fail(500,"DATABASE_ERROR","Unable to change package expiry");
 return {ok:true};
}
export async function teacherCreditRedemptionReturn(db:Db,teacherId:string,id:string){
 const {data,error}=await db.from("credit_redemptions").delete()
  .eq("id",id).eq("teacher_id",teacherId).select("id");
 if(error)throw fail(500,"DATABASE_ERROR","Unable to return used credit");
 if(!data?.length)throw fail(404,"NOT_FOUND","Credit redemption not found");
 return {ok:true};
}
