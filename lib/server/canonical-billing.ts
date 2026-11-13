import type {SupabaseClient} from "@supabase/supabase-js";
import {
  deriveInvoiceItems,isBillable,type BillableLessonInput,
} from "@/lib/billing";
import {allocateCredits,type CreditPackageInput,type CreditCandidate} from "@/lib/credits";
import {type StudioPolicy,oneToOne} from "@/lib/schedule";
import type {AttendanceStatus} from "@/lib/supabase/types";
import {loadCanonicalBillingParticipants,participantBillingKey}
 from "@/lib/server/canonical-billing-source";

export type CanonicalInvoiceItem={
 kind:"lesson"|"travel";sessionId:string;studentId:string;
 guardianId:string;description:string;quantity:number;
 unitCents:number;amountCents:number;missingRate:boolean;
};
export type CanonicalCreditInputs={
 packages:CreditPackageInput[];
 redeemedParticipantKeys:Set<string>;
};
export type CanonicalDerivedPeriod={
 items:CanonicalInvoiceItem[];
 skippedAlreadyInvoiced:number;
 newRedemptions:Map<string,string>;
 creditedByGuardian:Map<string,number>;
};
export function canonicalBillableStatus(status:string|null):AttendanceStatus|null{
 switch(status){
  case "present":case "late":return "attended";
  case "absent":return "no_show";
  case "student_cancelled":return "student_cancel";
  case "teacher_cancelled":return "teacher_cancel";
  case "excused":case null:return null;
  default:throw new Error("Unknown canonical attendance status");
 }
}
export async function getInvoicedParticipantKeys(
 db:SupabaseClient,teacherId:string,opts:{
  exceptInvoiceId?:string;kind?:"lesson"|"travel"
 }={}
):Promise<Set<string>>{
 const keys=new Set<string>(),page=500,max=50000;
 for(let offset=0;;offset+=page){
  const {data,error}=await db.from("invoice_items")
   .select("session_id,student_id,invoices!inner(id,teacher_id,status)")
   .not("session_id","is",null)
   .eq("kind",opts.kind??"lesson")
   .eq("invoices.teacher_id",teacherId)
   .in("invoices.status",["draft","sent","paid"])
   .order("id").range(offset,offset+page-1);
  if(error)throw new Error("Unable to inspect existing canonical invoices");
  for(const line of data??[]){
   const invoice=oneToOne(line.invoices as
     {id:string;status:string}|{id:string;status:string}[]|null);
   if(!invoice||invoice.id===opts.exceptInvoiceId)continue;
   if(line.session_id&&line.student_id)
     keys.add(participantBillingKey(line.session_id,line.student_id));
  }
  if(keys.size>max)throw new RangeError("Invoice history exceeds safe size");
  if((data?.length??0)<page)break;
 }
 return keys;
}
/** One shared billing policy engine; only canonical frozen-participant keys
 * ever cross the SQL ledger. No duplicate student charges or teacher minutes.
 */
export async function deriveCanonicalPeriodItems(
 db:SupabaseClient,teacherId:string,
 periodStart:string,periodEnd:string,policy:StudioPolicy,opts:{
  guardianId?:string;
  excludeParticipantKeys?:Set<string>;
  travelInvoicedParticipantKeys?:Set<string>;
  credits?:CanonicalCreditInputs;
 }={}
):Promise<CanonicalDerivedPeriod>{
 const rows=await loadCanonicalBillingParticipants(
  db,teacherId,periodStart,periodEnd,policy.timezone);
 const exclude=opts.excludeParticipantKeys??new Set<string>();
 const travelInvoiced=opts.travelInvoicedParticipantKeys??new Set<string>();
 const inputs:BillableLessonInput[]=[];
 let skippedAlreadyInvoiced=0;
 const participants=new Map<string,{sessionId:string;studentId:string}>();
 for(const row of rows){
  const status=canonicalBillableStatus(row.attendanceStatus);
  if(!status)continue;
  if(opts.guardianId&&row.guardianId!==opts.guardianId)continue;
  const key=participantBillingKey(row.sessionId,row.studentId);
  if(exclude.has(key)){skippedAlreadyInvoiced++;continue;}
  participants.set(key,{sessionId:row.sessionId,studentId:row.studentId});
  inputs.push({
   lessonId:key,studentId:row.studentId,studentName:row.studentName,
   guardianId:row.guardianId,lessonDate:row.lessonDate,
   startsAt:row.startsAt,durationMinutes:row.durationMinutes,
   makeupForSessionId:row.makeupForSessionId,attendanceStatus:status,
   noticeAt:row.noticeAt,isHomeVisit:row.isHomeVisit,
   rate:{
    slotRateCents:row.slotRateCents,
    studentDefaultRateCents:row.studentDefaultRateCents,
    studioDefaultRateCents:policy.default_rate_cents,
    durationRateCents:policy.duration_rate_cents[row.durationMinutes]??null,
   },
   travel:{
    studentTravelFeeCents:row.studentTravelFeeCents,
    studioTravelFeeCents:policy.travel_fee_cents,
   },
  });
 }
 const redeemed=opts.credits?.redeemedParticipantKeys??new Set<string>();
 const candidates:CreditCandidate[]=inputs.filter(x=>
   x.guardianId&&isBillable(x,policy)&&!redeemed.has(x.lessonId))
 .map(x=>({
  lessonId:x.lessonId,studentId:x.studentId,
  lessonDate:x.lessonDate,startsAt:x.startsAt,durationMinutes:x.durationMinutes,
 }));
 const newRedemptions=opts.credits
   ?allocateCredits(candidates,opts.credits.packages)
   :new Map<string,string>();
 const creditedByGuardian=new Map<string,number>();
 for(const x of inputs){
  if(!x.guardianId||!newRedemptions.has(x.lessonId))continue;
  creditedByGuardian.set(x.guardianId,(creditedByGuardian.get(x.guardianId)??0)+1);
 }
 const drafts=deriveInvoiceItems(inputs,policy,{
  creditedLessonIds:new Set([...redeemed,...newRedemptions.keys()]),
  travelInvoicedLessonIds:travelInvoiced,
 });
 const items=drafts.map(d=>{
  const participant=participants.get(d.lessonId);
  if(!participant)throw new Error("Orphaned canonical invoice draft");
  return {
   kind:d.kind,sessionId:participant.sessionId,studentId:participant.studentId,
   guardianId:d.guardianId,description:d.description,quantity:d.quantity,
   unitCents:d.unitCents,amountCents:d.amountCents,missingRate:d.missingRate,
  };
 });
 return {items,skippedAlreadyInvoiced,newRedemptions,creditedByGuardian};
}
