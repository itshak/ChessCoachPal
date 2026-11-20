import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy } from "@/lib/server/scheduling";
import {loadCanonicalCreditBalances,loadCanonicalCreditPackages} from "@/lib/server/canonical-credits";
import { validateCreditPackage } from "@/lib/credits";
import {toLocalDateString} from "@/lib/schedule";
import {teacherCreditAdjustmentCommit} from "@/lib/server/credit-adjustments";
import {CoachError} from "@/lib/server/coach-service";
type Db=SupabaseClient;
export class CreditServiceError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(s:number,c:string,m:string)=>new CreditServiceError(s,c,m);
export type CreateCreditInput={studentId:string;workplaceId:string;credits:number;durationMinutes:number;
 priceCents:number;startsOn?:string;expiresOn?:string|null;requestId?:string};
export async function teacherCreditPackagesList(db:Db,teacherId:string,studentId?:string){
 const policy=await getPolicy(db,teacherId);
 const today=toLocalDateString(new Date(),policy.timezone);
 if(studentId){
  const {data,error}=await db.from("students").select("id").eq("id",studentId).eq("teacher_id",teacherId).maybeSingle();
  if(error)throw fail(500,"DATABASE_ERROR","Unable to find student");
  if(!data)throw fail(404,"NOT_FOUND","Student not found");
  return {packages:await loadCanonicalCreditBalances(db,teacherId,policy,[studentId],today)};
 }
 return {packages:await loadCanonicalCreditPackages(db,teacherId,{timezone:policy.timezone})};
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
  p_workplace_id:input.workplaceId,
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
  if(error.message.includes("CREDIT_EXPLICIT_PAYER_REQUIRED"))
    throw fail(409,"PAYER_REQUIRED","Assign one effective-dated Billing Account to the selected workplace before selling credits");
  if(error.message.includes("CREDIT_WORKPLACE_ENROLLMENT_REQUIRED"))
    throw fail(409,"WORKPLACE_REQUIRED","Enroll the student in the selected workplace before selling credits");
  if(error.message.includes("INVALID_CREDIT_PACKAGE"))
    throw fail(400,"VALIDATION_ERROR","Invalid prepaid package terms");
  if(/NOT_FOUND|POLICY_NOT_FOUND/.test(error.message))
    throw fail(404,"NOT_FOUND","Student, workplace or billing policy not found");
  throw fail(500,"DATABASE_ERROR","Prepaid package could not be created; no partial invoice was left behind");
 }
 return data as {packageId:string;invoiceId:string;replayed:boolean};
}
/** Prepaid expiry is changed only by a reviewed, replay-safe entitlement event.
 * Shortening or clearing a contract date requires a separately approved policy.
 */
export async function teacherCreditPackageExpiry(db:Db,teacherId:string,id:string,
 expiresOn:string,review:{expectedBalance:number;requestId:string;reason:string}
){
 try{
  return await teacherCreditAdjustmentCommit(db,teacherId,{
   packageId:id,kind:"expiry_extension",credits:0,newExpiresOn:expiresOn,
   expectedBalance:review.expectedBalance,requestId:review.requestId,
   reason:review.reason,confirmed:true,
  });
 }catch(error){
  if(error instanceof CoachError)throw fail(error.status,error.code,error.message);
  throw error;
 }
}
export async function teacherCreditRedemptionReturn(db:Db,teacherId:string,id:string){
 // No direct DELETE: a one-shot REST delete would make cross-client retries
 // indistinguishable from unauthorized IDs. This authenticated RPC checks
 // auth.uid(), serializes concurrent returns, and writes the replay receipt in
 // the same transaction. teacherId remains the request's owned-tenant context,
 // but the SQL NEVER trusts it as a caller-supplied authorization parameter.
 void teacherId;
 const {data,error}=await db.rpc("ccp_credit_redemption_return",{
  p_redemption_id:id,
 });
 if(error){
  if(/NOT_FOUND/.test(error.message))throw fail(404,"NOT_FOUND","Credit redemption not found");
  if(/INVALID_REDEMPTION_ID/.test(error.message))
   throw fail(400,"VALIDATION_ERROR","Invalid credit redemption ID");
  throw fail(500,"DATABASE_ERROR","Unable to return used credit");
 }
 return data as {ok:true;replayed:boolean};
}
