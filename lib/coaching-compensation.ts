/**
 * Deterministic, provider-independent expected coach earnings from actual
 * canonical teaching occurrences. This is not a statement of cash received,
 * customer debt, an issued invoice, or tax-compliant payroll.
 *
 * A teacher's group teaching hour is counted once. Pupil-level charging is
 * always a separate contract, never inferred from coach earnings.
 */
export type CompensationModel="hourly"|"per_session"|"per_student"|"fixed_period";
export type CompensationAgreement={
 id:string;workplaceId:string;model:CompensationModel;rateCents:number;
 currency:string;effectiveFrom:string;effectiveTo:string|null;
 periodStart?:string;periodEnd?:string;
};
export type CompensationOccurrence={
 id:string;workplaceId:string;lessonDate:string;
 durationMinutes:number;status:"scheduled"|"completed"|"cancelled";
 participantIds:string[];
 /** Student-specific attendance is recorded explicitly, even for absence. A
  * completed calendar session alone never proves its participant outcomes. */
 markedStudentIds:string[];
 /** Only teacher-confirmed present or late marks, always a subset of marked. */
 attendedStudentIds:string[];
};
export type CompensationSummary={
 agreementId:string;currency:string;model:CompensationModel;
 eligibleSessionCount:number;eligibleInstructorMinutes:number;
 eligibleParticipantCount:number;expectedCents:number;
 /** Completed sessions with missing/partial attendance, never billed/earned. */
 unconfirmedSessionCount:number;
 periodStart:string;periodEnd:string;
};
function date(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||
    !Number.isFinite(Date.parse(value+"T00:00:00Z"))||
    new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)
  throw new RangeError("Invalid compensation local date");
 return value;
}
function money(value:number){
 if(!Number.isSafeInteger(value)||value<0||value>1_000_000_000)
  throw new RangeError("Compensation amount must be a valid, nonnegative integer in minor units");
 return value;
}
const unique=(values:string[],label:string)=>{
 const set=new Set(values);
 if(set.size!==values.length)throw new Error(`Duplicate ${label}`);
 return set;
};
const safePlus=(x:number,y:number)=>{
 const sum=x+y;
 if(!Number.isSafeInteger(sum))throw new RangeError("Compensation total overflow");
 return sum;
};
export function calculateExpectedCompensation(
 agreement:CompensationAgreement,occurrences:CompensationOccurrence[],
 from:string,to:string
):CompensationSummary{
 date(from);date(to);date(agreement.effectiveFrom);
 if(from>to)throw new RangeError("Compensation range is reversed");
 if(agreement.effectiveTo&&date(agreement.effectiveTo)<agreement.effectiveFrom)
  throw new RangeError("Agreement effective range is reversed");
 money(agreement.rateCents);
 if(!agreement.id||!agreement.workplaceId||!/^[A-Z]{3}$/.test(agreement.currency))
  throw new TypeError("Agreement identity, workplace and ISO currency are required");
 if(!["hourly","per_session","per_student","fixed_period"].includes(agreement.model))
  throw new TypeError("Unknown compensation model");
 if(agreement.model==="fixed_period"){
  if(!agreement.periodStart||!agreement.periodEnd)
   throw new Error("Fixed-period compensation needs an explicitly approved effective period");
  date(agreement.periodStart);date(agreement.periodEnd);
  if(agreement.periodStart>agreement.periodEnd||
    agreement.periodStart<agreement.effectiveFrom||
    (agreement.effectiveTo&&agreement.periodEnd>agreement.effectiveTo))
   throw new RangeError("Fixed-period boundaries do not fit the agreement");
  // A monthly salary is not automatically prorated. Only an exact approved
  // accounting period accrues once, irrespective of classes or participants.
  if(from!==agreement.periodStart||to!==agreement.periodEnd)
   throw new Error("Fixed-period compensation must use exactly its approved period");
 }
 let eligibleSessionCount=0,eligibleInstructorMinutes=0;
 let eligibleParticipantCount=0,expectedCents=0,unconfirmedSessionCount=0;
 const ids=new Set<string>();
 for(const occurrence of occurrences){
  if(ids.has(occurrence.id))throw new Error("Duplicate canonical session ID");
  ids.add(occurrence.id);
  if(!occurrence.id||!Number.isSafeInteger(occurrence.durationMinutes)||
     occurrence.durationMinutes<15||occurrence.durationMinutes>480)
   throw new RangeError("Invalid canonical session duration");
  date(occurrence.lessonDate);
  if(occurrence.workplaceId!==agreement.workplaceId||
     occurrence.lessonDate<from||occurrence.lessonDate>to||
     occurrence.lessonDate<agreement.effectiveFrom||
     (agreement.effectiveTo&&occurrence.lessonDate>agreement.effectiveTo))continue;
  if(occurrence.status!=="completed")continue;
  const roster=unique(occurrence.participantIds,"canonical frozen roster participant");
  const marked=unique(occurrence.markedStudentIds,"marked attendance decision");
  const attended=unique(occurrence.attendedStudentIds,"attendance decision");
  for(const pupil of marked){
   if(!roster.has(pupil))throw new Error("Unrecognized pupil in marked attendance");
  }
  for(const pupil of attended){
   if(!roster.has(pupil)||!marked.has(pupil))
    throw new Error("Unrecognized pupil in recorded attendance");
  }
  // A teacher can complete a calendar occurrence without actually completing
  // its pupil-by-pupil attendance. That status is not permission to accrue an
  // invoice or a wage. Also do not auto-charge cancelled/no-show-only events:
  // these require a separate explicitly agreed cancellation policy.
  if(roster.size===0||marked.size!==roster.size||attended.size===0){
   unconfirmedSessionCount++;continue;
  }
  eligibleSessionCount++;
  eligibleInstructorMinutes=safePlus(eligibleInstructorMinutes,occurrence.durationMinutes);
  eligibleParticipantCount=safePlus(eligibleParticipantCount,attended.size);
  switch(agreement.model){
   case "hourly": {
    // Avoid binary floating-point rounding of money; half up to cents.
    const cents=Number((BigInt(agreement.rateCents)*BigInt(occurrence.durationMinutes)+BigInt(30))/BigInt(60));
    expectedCents=safePlus(expectedCents,cents);break;
   }
   case "per_session":expectedCents=safePlus(expectedCents,agreement.rateCents);break;
   case "per_student":expectedCents=safePlus(expectedCents,agreement.rateCents*attended.size);break;
   case "fixed_period":break;
  }
 }
 if(agreement.model==="fixed_period")expectedCents=agreement.rateCents;
 return {agreementId:agreement.id,currency:agreement.currency,model:agreement.model,
  eligibleSessionCount,eligibleInstructorMinutes,eligibleParticipantCount,
  expectedCents,unconfirmedSessionCount,periodStart:from,periodEnd:to};
}
