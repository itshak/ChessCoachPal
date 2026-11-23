import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {toLocalDateString} from "@/lib/schedule";
import {CompensationAgreementError} from "./compensation-agreements-service";

const id=z.string().uuid(), day=z.iso.date(), currency=z.string().regex(/^[A-Z]{3}$/);
export const exactSponsorReviewSchema=z.object({workplaceId:id,sessionId:id,day}).strict();
const approval={confirmed:z.literal(true),idempotencyKey:id};
const exactSponsorCommitBranches=z.discriminatedUnion("action",[
 z.object({...approval,action:z.literal("create"),workplaceId:id,sessionId:id,studentId:id,
  billingAccountId:id,day,currency,model:z.enum(["hourly","per_session","per_student"]),
  rateCents:z.number().int().min(1).max(1_000_000_000)}).strict(),
 z.object({...approval,action:z.literal("archive"),agreementId:id,
  expectedRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict()
]);
// MCP requires the portable root schema itself to be an object.
export const exactSponsorCommitSchema=z.object({...approval,action:z.enum(["create","archive"]),
 workplaceId:id.optional(),sessionId:id.optional(),studentId:id.optional(),billingAccountId:id.optional(),
 day:day.optional(),currency:currency.optional(),model:z.enum(["hourly","per_session","per_student"]).optional(),
 rateCents:z.number().int().min(1).max(1_000_000_000).optional(),agreementId:id.optional(),
 expectedRevision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().superRefine((v,ctx)=>{
 const parsed=exactSponsorCommitBranches.safeParse(v);
 if(!parsed.success)ctx.addIssue({code:"custom",message:"Supply only the fields for the selected action"});
});
function fail(code:string,status:number):never{
 throw new CompensationAgreementError(status,code,code);
}
export async function exactSponsorReview(db:SupabaseClient,teacherId:string,input:z.input<typeof exactSponsorReviewSchema>){
 const v=exactSponsorReviewSchema.parse(input);
 const [venue,lesson]=await Promise.all([
  db.from("workplaces").select("id,timezone,currency").eq("teacher_id",teacherId).eq("id",v.workplaceId).maybeSingle(),
  db.from("teaching_sessions").select("id,title,starts_at,local_timezone").eq("teacher_id",teacherId)
   .eq("workplace_id",v.workplaceId).eq("id",v.sessionId).eq("status","completed").maybeSingle(),
 ]);
 if(venue.error||lesson.error)fail("EXACT_SPONSOR_REVIEW_UNAVAILABLE",503);
 if(!venue.data||!lesson.data)fail("EXACT_AGREEMENT_SCOPE_UNAVAILABLE",404);
 const timezone=lesson.data.local_timezone??venue.data.timezone??"UTC";
 const actualDay=toLocalDateString(new Date(lesson.data.starts_at),timezone);
 if(actualDay!==v.day)fail("EXACT_AGREEMENT_SCOPE_UNAVAILABLE",404);
 const [roster,payers,activeTerms]=await Promise.all([
  db.from("session_participants").select("student_id,sponsor_billing_review_required",{count:"exact"})
   .eq("teacher_id",teacherId).eq("session_id",v.sessionId).order("student_id").limit(101),
  db.from("billing_accounts").select("id,display_name",{count:"exact"}).eq("teacher_id",teacherId)
   .eq("status","active").order("display_name").order("id").limit(101),
  db.from("compensation_agreements").select("id,student_id,revision",{count:"exact"})
   .eq("teacher_id",teacherId).eq("workplace_id",v.workplaceId).eq("exact_session_id",v.sessionId)
   .eq("agreement_role","participant_charge").eq("status","active").order("student_id").limit(101),
 ]);
 if(roster.error||payers.error||activeTerms.error||!roster.data||!payers.data||!activeTerms.data||
    activeTerms.count!==activeTerms.data.length||activeTerms.count>100||
    roster.count!==roster.data.length||payers.count!==payers.data.length||
    roster.count>100||payers.count>100)fail("EXACT_SPONSOR_REVIEW_UNAVAILABLE",503);
 const ids=roster.data.map(x=>x.student_id);
 const students=ids.length>0?await db.from("students").select("id,name").eq("teacher_id",teacherId)
   .in("id",ids):{data:[],error:null};
 if(students.error||!students.data||students.data.length!==ids.length)fail("EXACT_SPONSOR_REVIEW_UNAVAILABLE",503);
 const activeByStudent=new Map(activeTerms.data.map(a=>[a.student_id,{id:a.id,revision:Number(a.revision)}]));
 const names=new Map(students.data.map(s=>[s.id,s.name]));
 return {workplaceId:v.workplaceId,sessionId:v.sessionId,day:actualDay,timezone,
  title:lesson.data.title,startsAt:lesson.data.starts_at,currency:venue.data.currency,
  participants:roster.data.map(x=>({id:x.student_id,name:names.get(x.student_id)!,
   activeAgreement:activeByStudent.get(x.student_id)??null,
   automaticBillingReviewRequired:x.sponsor_billing_review_required})),
  payers:payers.data.map(payer=>({id:payer.id,name:payer.display_name}))};
}

const result=z.object({agreementId:id,workplaceId:id,exactSessionId:id,studentId:id,
 billingAccountId:id,model:z.enum(["hourly","per_session","per_student"]),rateCents:z.number().int().positive(),
 currency,day,status:z.enum(["active","archived"]),revision:z.number().int().positive(),replayed:z.boolean()}).strict();
export async function exactSponsorCommit(db:SupabaseClient,input:z.input<typeof exactSponsorCommitSchema>){
 const v=exactSponsorCommitBranches.parse(input);
 const create=v.action==="create"?v:null, archive=v.action==="archive"?v:null;
 // Do not pre-read current app state here: the signed RPC must consult the immutable exact receipt first.
 const {data,error}=await db.rpc("ccp_compensation_exact_sponsor_commit",{
  p_workplace:create?.workplaceId??null,p_session:create?.sessionId??null,p_student:create?.studentId??null,
  p_payer:create?.billingAccountId??null,p_model:create?.model??null,p_rate_cents:create?.rateCents??null,
  p_currency:create?.currency??null,p_day:create?.day??null,p_archive_agreement:archive?.agreementId??null,
  p_expected_revision:archive?.expectedRevision??null,p_request_id:v.idempotencyKey,p_confirmed:v.confirmed,
 });
 if(error){
  if(error.code==="23505"&&error.message.includes('unique constraint "compensation_one_active_participant_sponsor"'))
   fail("EXACT_SPONSOR_REVIEW_CHANGED",409);
  switch(error.message){
   case "EXACT_AGREEMENT_SCOPE_UNAVAILABLE":fail(error.code==="42501"?error.message:"EXACT_SPONSOR_REVIEW_CHANGED",error.code==="42501"?404:409);
   case "EXACT_SPONSOR_RETAINED_BILLING_SOURCE": case "EXACT_AGREEMENT_ALREADY_POSTED":
   case "EXACT_SPONSOR_REQUEST_CONFLICT": case "STALE_AGREEMENT_REVISION":
    fail(error.message,409);
   default:fail("EXACT_SPONSOR_OUTCOME_UNAVAILABLE",503);
  }
 }
 const parsed=result.safeParse(data);
 return parsed.success?parsed.data:fail("EXACT_SPONSOR_OUTCOME_UNAVAILABLE",503);
}
