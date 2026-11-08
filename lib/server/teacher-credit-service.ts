import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy } from "@/lib/server/scheduling";
import { loadCreditBalances, loadCreditPackages } from "@/lib/server/credits";
import { validateCreditPackage,describeCreditPackage } from "@/lib/credits";
import { oneToOne,toLocalDateString } from "@/lib/schedule";
type Db=SupabaseClient;
export class CreditServiceError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(s:number,c:string,m:string)=>new CreditServiceError(s,c,m);
export type CreateCreditInput={studentId:string;credits:number;durationMinutes:number;
 priceCents:number;startsOn?:string;expiresOn?:string|null};
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
export async function teacherCreditPackageCreate(db:Db,teacherId:string,input:CreateCreditInput){
 const policy=await getPolicy(db,teacherId);
 const today=toLocalDateString(new Date(),policy.timezone);
 const request={
  credits:input.credits,durationMinutes:input.durationMinutes,priceCents:input.priceCents,
  startsOn:input.startsOn??today,expiresOn:input.expiresOn||null,
 };
 const invalid=validateCreditPackage(request);
 if(invalid)throw fail(400,"VALIDATION_ERROR",invalid);
 const {data:student,error:studentError}=await db.from("students")
  .select("id,name,guardian_id,archived_at")
  .eq("teacher_id",teacherId).eq("id",input.studentId).maybeSingle();
 if(studentError)throw fail(500,"DATABASE_ERROR","Student lookup failed");
 if(!student)throw fail(404,"NOT_FOUND","Student not found");
 if(student.archived_at)throw fail(409,"ARCHIVED","Reactivate student before selling prepaid lessons");
 if(!student.guardian_id)throw fail(400,"VALIDATION_ERROR","Link the student to a family before selling credits");
 const {data:invoice,error:invoiceError}=await db.from("invoices").insert({
  teacher_id:teacherId,guardian_id:student.guardian_id,period_start:today,
  period_end:today,status:"draft",subtotal_cents:request.priceCents,currency:policy.currency,
 }).select("id").single();
 if(invoiceError||!invoice)throw fail(500,"DATABASE_ERROR","Unable to create prepaid invoice");
 const {error:itemError}=await db.from("invoice_items").insert({
  invoice_id:invoice.id,lesson_id:null,kind:"credit_package",
  description:`Prepaid ${describeCreditPackage(request.credits,request.durationMinutes)} - ${student.name}`,
  quantity:1,unit_cents:request.priceCents,amount_cents:request.priceCents,sort_order:0,
 });
 const {data:creditPackage,error:packageError}=itemError?{data:null,error:itemError}:
  await db.from("credit_packages").insert({
   teacher_id:teacherId,student_id:student.id,invoice_id:invoice.id,
   credits:request.credits,duration_minutes:request.durationMinutes,
   price_cents:request.priceCents,starts_on:request.startsOn,expires_on:request.expiresOn,
  }).select("id").single();
 if(packageError||!creditPackage){
  await db.from("invoices").delete().eq("id",invoice.id).eq("teacher_id",teacherId);
  throw fail(500,"DATABASE_ERROR","Prepaid package failed; draft invoice was rolled back");
 }
 return {packageId:creditPackage.id,invoiceId:invoice.id};
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
