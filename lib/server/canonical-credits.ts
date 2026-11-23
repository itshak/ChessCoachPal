import type {SupabaseClient} from "@supabase/supabase-js";
import {oneToOne,addDays,toLocalDateString,type TeacherPolicy} from "@/lib/schedule";
import {
 allocateCredits,summarizeCreditBalances,type CreditPackageInput,
 type CreditPackageBalance,
} from "@/lib/credits";
import type {InvoiceStatus} from "@/lib/supabase/types";
import {getInvoicedParticipantKeys,deriveCanonicalPeriodItems}
 from "@/lib/server/canonical-billing";
import {participantBillingKey} from "@/lib/server/canonical-billing-source";

export interface CanonicalPackageRecord extends CreditPackageInput{
 invoiceId:string;invoiceStatus:InvoiceStatus;priceCents:number;
 invoiceWorkflowStatus:InvoiceStatus|null;invoiceCurrency:string|null;
 createdAt:string;
 redemptions:{id:string;sessionId:string;studentId:string;lessonDate:string|null}[];
}
export interface CanonicalPackageWithBalance extends CanonicalPackageRecord{
 balance:CreditPackageBalance;
}
type PackageRow={
 id:string;student_id:string;workplace_id:string;invoice_id:string;credits:number;
 duration_minutes:number;price_cents:number;starts_on:string;
 expires_on:string|null;created_at:string;
 invoices:{status:InvoiceStatus;currency:string}|{status:InvoiceStatus;currency:string}[]|null;
 credit_redemptions:{id:string;session_id:string|null;student_id:string|null}[]|null;
};
const PAGE=500;
export async function loadCanonicalCreditPackages(db:SupabaseClient,teacherId:string,
 opts:{studentIds?:string[];timezone?:string}={}):Promise<CanonicalPackageRecord[]>{
 if(opts.studentIds?.length===0)return [];
 const all:PackageRow[]=[];
 for(let offset=0;;offset+=PAGE){
  let q=db.from("credit_packages").select(
   "id,student_id,workplace_id,invoice_id,credits,duration_minutes,price_cents,starts_on,expires_on,created_at,invoices(status,currency),credit_redemptions(id,session_id,student_id)"
  ).eq("teacher_id",teacherId).order("created_at",{ascending:false}).order("id")
   .range(offset,offset+PAGE-1);
  if(opts.studentIds)q=q.in("student_id",opts.studentIds);
  const {data,error}=await q;
  if(error)throw new Error("Unable to load canonical credit packages");
  all.push(...(data??[]) as PackageRow[]);
  if(all.length>20000)throw new RangeError("Credit packages exceed safe inventory");
  if((data?.length??0)<PAGE)break;
 }
 // A package's canonical remaining amount includes every approved
 // entitlement event. Use one tenant-bound, paginated ledger read; a
 // post-archive package still participates in reporting and redemptions.
 const adjustmentTotal=new Map<string,number>();
 const extension=new Map<string,string>();
 const packageIds=new Set(all.map(x=>x.id));
 for(let offset=0;;offset+=PAGE){
  const {data,error}=await db.from("credit_adjustment_events")
   .select("id,package_id,kind,credits_delta,new_expires_on,recorded_at")
   .eq("teacher_id",teacherId)
   .order("recorded_at",{ascending:true}).order("id")
   .range(offset,offset+PAGE-1);
  if(error)throw new Error("Unable to load canonical credit adjustments");
  for(const row of data??[]){
   if(!packageIds.has(row.package_id))continue;
   adjustmentTotal.set(row.package_id,
    (adjustmentTotal.get(row.package_id)??0)+row.credits_delta);
   if(row.kind==="expiry_extension"&&row.new_expires_on)
    extension.set(row.package_id,row.new_expires_on);
  }
  if(offset>100000)throw new RangeError("Credit adjustments exceed safe inventory");
  if((data?.length??0)<PAGE)break;
 }
 const ids=[...new Set(all.flatMap(x=>(x.credit_redemptions??[])
   .flatMap(r=>r.session_id?[r.session_id]:[])))];
 const starts=new Map<string,{starts_at:string;local_timezone:string|null;workplace_id:string}>();
 for(let i=0;i<ids.length;i+=100){
  const {data,error}=await db.from("teaching_sessions")
   .select("id,starts_at,local_timezone,workplace_id")
   .eq("teacher_id",teacherId).in("id",ids.slice(i,i+100));
  if(error)throw new Error("Unable to resolve redeemed session dates");
  for(const row of data??[])starts.set(row.id,row);
 }
 return all.map(row=>{
  const invoice=oneToOne(row.invoices);
  const invoiceStatus=invoice?.status??"void";
  const redemptions=(row.credit_redemptions??[]).flatMap(r=>{
   if(!r.session_id||!r.student_id)return [];
   const session=starts.get(r.session_id);
   return [{
    id:r.id,sessionId:r.session_id,studentId:r.student_id,
    lessonDate:session?toLocalDateString(new Date(session.starts_at),
      session.local_timezone||opts.timezone||"UTC"):null,
   }];
  }).sort((a,b)=>(a.lessonDate??"").localeCompare(b.lessonDate??""));
  return {
   id:row.id,studentId:row.student_id,workplaceId:row.workplace_id,durationMinutes:row.duration_minutes,
   credits:row.credits,usedCredits:redemptions.length,
   adjustmentCredits:adjustmentTotal.get(row.id)??0,
   startsOn:row.starts_on,expiresOn:extension.get(row.id)??row.expires_on,
   active:invoiceStatus==="sent"||invoiceStatus==="paid",
   invoiceId:row.invoice_id,invoiceStatus,priceCents:row.price_cents,
   invoiceWorkflowStatus:invoice?.status??null,invoiceCurrency:invoice?.currency??null,
   createdAt:row.created_at,redemptions,
  };
 });
}
export async function getRedeemedParticipantKeys(
 db:SupabaseClient,teacherId:string):Promise<Set<string>>{
 const keys=new Set<string>();
 for(let offset=0;;offset+=PAGE){
  const {data,error}=await db.from("credit_redemptions")
   .select("session_id,student_id")
   .eq("teacher_id",teacherId).order("id").range(offset,offset+PAGE-1);
  if(error)throw new Error("Unable to read canonical prepaid redemptions");
  for(const r of data??[])if(r.session_id&&r.student_id)
   keys.add(participantBillingKey(r.session_id,r.student_id));
  if(keys.size>50000)throw new RangeError("Credit ledger too large");
  if((data?.length??0)<PAGE)break;
 }
 return keys;
}
export async function loadCanonicalCreditInputs(db:SupabaseClient,teacherId:string,
 timezone="UTC"):Promise<{
 packages:CreditPackageInput[];
 redeemedParticipantKeys:Set<string>;
}>{
 const [packages,redeemedParticipantKeys]=await Promise.all([
  loadCanonicalCreditPackages(db,teacherId,{timezone}),
  getRedeemedParticipantKeys(db,teacherId),
 ]);
 return {packages,redeemedParticipantKeys};
}
export async function recordCanonicalRedemptions(
 db:SupabaseClient,teacherId:string,allocations:Map<string,string>
):Promise<string|null>{
 if(!allocations.size)return null;
 const rows=[...allocations].map(([key,packageId])=>{
  const [sessionId,studentId]=key.split(":");
  if(!/^[0-9a-f-]{36}$/i.test(sessionId)||!/^[0-9a-f-]{36}$/i.test(studentId))
   throw new Error("Malformed canonical participant credit key");
  return {teacher_id:teacherId,session_id:sessionId,
   student_id:studentId,package_id:packageId};
 });
 const {error}=await db.from("credit_redemptions").insert(rows);
 return error?error.message:null;
}
export async function loadCanonicalCreditBalances(
 db:SupabaseClient,teacherId:string,policy:TeacherPolicy,
 studentIds:string[],today:string,options:{includeClosed?:boolean}={}
):Promise<CanonicalPackageWithBalance[]>{
 const packages=(await loadCanonicalCreditPackages(db,teacherId,{
  studentIds,timezone:policy.timezone,
 })).filter(x=>options.includeClosed||x.invoiceStatus!=="void");
 if(!packages.length)return [];
 const usable=packages.filter(x=>x.active);
 let pending=new Map<string,string>();
 if(usable.length){
  const earliest=usable.reduce((m,p)=>p.startsOn<m?p.startsOn:m,
   usable[0].startsOn);
  const {data:last,error:dateError}=await db.from("teaching_sessions")
   .select("starts_at").eq("teacher_id",teacherId)
   .order("starts_at",{ascending:false}).limit(1).maybeSingle();
  if(dateError)throw new Error("Cannot inspect future credit commitments");
  const latest=last?toLocalDateString(new Date(last.starts_at),policy.timezone):today;
  const end=addDays(latest>today?latest:today,2);
  const [redeemed,exclude]=await Promise.all([
   getRedeemedParticipantKeys(db,teacherId),
   getInvoicedParticipantKeys(db,teacherId),
  ]);
  const result=await deriveCanonicalPeriodItems(db,teacherId,earliest,end,policy,{
   // Do not make this student's credit history depend on unrelated
   // workplace lessons and their independent payer arrangements.
   studentIds,excludeParticipantKeys:exclude,
   credits:{packages:usable,redeemedParticipantKeys:redeemed},
  });
  pending=result.newRedemptions;
 }
 const balances=summarizeCreditBalances(packages,pending,today);
 return packages.map((pkg,i)=>({...pkg,balance:balances[i]}));
}
