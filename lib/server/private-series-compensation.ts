import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {addDays,toLocalDateString} from "@/lib/schedule";
import {privateSeriesTerminalCode} from "@/lib/private-series-approval-errors";
import {CompensationAgreementError} from "./compensation-agreements-service";

const uuid=z.string().uuid(),day=z.iso.date(),model=z.enum(["hourly","per_session","per_student"]);
const currency=z.string().regex(/^[A-Z]{3}$/),amount=z.number().int().min(1).max(1_000_000_000);
const revision=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const approval={idempotencyKey:uuid,confirmed:z.literal(true)};
export const privateSeriesReadSchema=z.object({workplaceId:uuid,privateSeriesId:uuid.optional(),agreementId:uuid.optional()}).strict()
 .refine(v=>!v.agreementId||v.privateSeriesId,"An agreement must be anchored to its exact series");
const branches=z.discriminatedUnion("action",[
 z.object({action:z.literal("terms"),...approval,workplaceId:uuid,privateSeriesId:uuid,billingAccountId:uuid,
  currency,model,rateCents:amount,from:day,to:day}).strict(),
 z.object({action:z.literal("archive"),...approval,agreementId:uuid,expectedRevision:revision}).strict(),
 z.object({action:z.literal("post"),...approval,agreementId:uuid,expectedRevision:revision,
  expectedAmountCents:amount,sessionId:uuid,privateSeriesId:uuid,taughtOn:day}).strict(),
]);
export const privateSeriesWriteSchema=z.object({action:z.enum(["terms","archive","post"]),...approval,
 workplaceId:uuid.optional(),privateSeriesId:uuid.optional(),billingAccountId:uuid.optional(),currency:currency.optional(),
 model:model.optional(),rateCents:amount.optional(),from:day.optional(),to:day.optional(),agreementId:uuid.optional(),
 expectedRevision:revision.optional(),expectedAmountCents:amount.optional(),sessionId:uuid.optional(),taughtOn:day.optional(),
}).strict().refine(v=>branches.safeParse(v).success,"Supply only the exact selected action fields");
function fail(code="PRIVATE_SERIES_SCOPE_UNAVAILABLE",status=404):never{
 throw new CompensationAgreementError(status,code,code);
}
const readFail=()=>fail("PRIVATE_SERIES_REVIEW_UNAVAILABLE",503);
const MAX=100;
type FiniteRows<T>={data:T[]|null;error:unknown;count:number|null};
function complete<T>(value:FiniteRows<T>):T[]{
 if(value.error||!value.data||value.count!==value.data.length||value.data.length>MAX)
  return readFail();
 return value.data;
}
const slotCols="id,series_id,student_id,day_of_week,start_time,start_date,end_date,active";
const termCols="id,private_series_id,workplace_id,billing_account_id,model,rate_cents,currency,effective_from,effective_to,status,revision";
type TermRow={id:string;private_series_id:string;workplace_id:string;billing_account_id:string;model:string;
 rate_cents:number;currency:string;effective_from:string;effective_to:string;status:string;revision:number};
function term(r:TermRow){
 return {id:r.id,privateSeriesId:r.private_series_id,workplaceId:r.workplace_id,billingAccountId:r.billing_account_id,
  model:model.parse(r.model),rateCents:amount.parse(r.rate_cents),currency:currency.parse(r.currency),
  from:r.effective_from,to:r.effective_to,status:z.enum(["active","archived"]).parse(r.status),revision:revision.parse(r.revision)};
}
export async function privateSeriesRead(db:SupabaseClient,owner:string,input:z.input<typeof privateSeriesReadSchema>){
 const v=privateSeriesReadSchema.parse(input);
 const {data:venue,error}=await db.from("workplaces").select("id,name,currency,timezone,archived_at")
  .eq("teacher_id",owner).eq("id",v.workplaceId).maybeSingle();
 if(error)return readFail();
 if(!venue)return fail();
 const common={workplaceId:v.workplaceId,workplaceName:venue.name,currency:venue.currency,
  timezone:venue.timezone,workplaceArchived:Boolean(venue.archived_at)};
 if(!v.privateSeriesId){
  const segments=complete(await db.from("lesson_slots").select(slotCols,{count:"exact"})
   .eq("teacher_id",owner).eq("workplace_id",v.workplaceId)
   .order("series_id").order("id").limit(MAX+1));
  const roots=segments.filter(r=>r.id===r.series_id);
  const studentIds=[...new Set(roots.map(x=>x.student_id))];
  const students=studentIds.length?await db.from("students").select("id,name").eq("teacher_id",owner).in("id",studentIds):{data:[],error:null};
  if(students.error||students.data?.length!==studentIds.length)return readFail();
  const names=new Map(students.data.map(r=>[r.id,r.name]));
  return {...common,series:roots.map(r=>({id:r.id,studentName:names.get(r.student_id)!,
   weekday:r.day_of_week,startTime:r.start_time,hasActiveSegment:segments.some(s=>s.active&&s.series_id===r.id)})),
   detail:null};
 }
 const privateSeriesId=v.privateSeriesId;
 const {data:root,error:rootError}=await db.from("lesson_slots").select(slotCols)
  .eq("teacher_id",owner).eq("workplace_id",v.workplaceId).eq("id",privateSeriesId).eq("series_id",privateSeriesId).maybeSingle();
 if(rootError)return readFail();
 if(!root)return fail();
 const [segmentRead,payerRead,termsRead,student]=await Promise.all([
  db.from("lesson_slots").select(slotCols,{count:"exact"}).eq("teacher_id",owner).eq("workplace_id",v.workplaceId)
   .eq("series_id",privateSeriesId).order("start_date").order("id").limit(MAX+1),
  db.from("billing_accounts").select("id,display_name",{count:"exact"}).eq("teacher_id",owner).eq("status","active")
   .order("display_name").order("id").limit(MAX+1),
  db.from("compensation_agreements").select(termCols,{count:"exact"}).eq("teacher_id",owner).eq("workplace_id",v.workplaceId)
   .eq("private_series_id",privateSeriesId).order("effective_from").order("id").limit(MAX+1),
  db.from("students").select("id,name").eq("teacher_id",owner).eq("id",root.student_id).maybeSingle(),
 ]);
 if(student.error||!student.data)return readFail();
 const segments=complete(segmentRead).map(x=>({id:x.id,weekday:x.day_of_week,startTime:x.start_time,
  from:x.start_date,to:x.end_date,active:x.active}));
 const payers=complete(payerRead).map(x=>({id:x.id,name:x.display_name}));
 const terms=complete(termsRead).map(term);
 const detail={privateSeriesId,studentName:student.data.name,segments,payers,terms,
  currentVenueDay:toLocalDateString(new Date(),venue.timezone||"UTC")};
 if(!v.agreementId)return {...common,series:[],detail,review:null};
 const selected=terms.find(t=>t.id===v.agreementId);
 if(!selected)return fail();
 const base={term:selected,occurrences:[] as OccurrenceChoice[], forecastCents:0};
 if(selected.status!=="active")return {...common,series:[],detail,review:{...base,state:"archived" as const}};
 if(!payers.some(x=>x.id===selected.billingAccountId))
  return {...common,series:[],detail,review:{...base,state:"payer_review" as const}};
 const rowset=complete(await db.from("teaching_sessions")
  .select("id,title,starts_at,duration_minutes,slot_occurrence_date,local_timezone",{count:"exact"})
  .eq("teacher_id",owner).eq("workplace_id",v.workplaceId).eq("source_private_series_id",privateSeriesId)
  .eq("status","completed").gte("starts_at",addDays(selected.from,-2)+"T00:00:00Z")
  .lt("starts_at",addDays(selected.to,2)+"T00:00:00Z").order("starts_at").order("id").limit(MAX+1));
 if(rowset.some(x=>!x.slot_occurrence_date))return readFail();
 const dated=rowset.map(x=>{
  const timezone=x.local_timezone||venue.timezone||"UTC";
  return {...x,timezone,taughtOn:toLocalDateString(new Date(x.starts_at),timezone)};
 })
  .filter(x=>x.taughtOn>=selected.from&&x.taughtOn<=selected.to);
 const ids=dated.map(x=>x.id);
 if(!ids.length)return {...common,series:[],detail,review:{...base,state:"ready" as const}};
 const [exactRead,rosterRead,attendanceRead,postedRead]=await Promise.all([
  db.from("compensation_agreements").select("exact_session_id",{count:"exact"}).eq("teacher_id",owner).eq("workplace_id",v.workplaceId)
   .eq("agreement_role","coach_earning").eq("status","active").in("exact_session_id",ids).limit(MAX+1),
  db.from("session_participants").select("session_id,student_id",{count:"exact"}).eq("teacher_id",owner).in("session_id",ids).limit(MAX+1),
  db.from("session_attendance").select("session_id,student_id,status",{count:"exact"}).eq("teacher_id",owner).in("session_id",ids).limit(MAX+1),
  db.from("financial_obligations").select("id,session_id",{count:"exact"}).eq("teacher_id",owner)
   .eq("workplace_id",v.workplaceId).eq("kind","coach_earning").in("session_id",ids).limit(MAX+1),
 ]);
 const exact=new Set(complete(exactRead).map(x=>x.exact_session_id));
 const roster=complete(rosterRead),attendance=complete(attendanceRead);
 const posted=new Set(complete(postedRead).map(x=>x.session_id));
 const occurrences:OccurrenceChoice[]=dated.map(x=>{
  const members=roster.filter(r=>r.session_id===x.id);
  const marks=members.map(m=>attendance.find(a=>a.session_id===x.id&&a.student_id===m.student_id));
  const attended=marks.filter(a=>a?.status==="present"||a?.status==="late").length;
  const expected=selected.model==="hourly"?Math.floor((selected.rateCents*x.duration_minutes+30)/60):
   selected.model==="per_student"?selected.rateCents*attended:selected.rateCents;
  const state=posted.has(x.id)?"posted":exact.has(x.id)?"exact_terms":!members.length||marks.some(m=>!m)||!attended?
   "attendance_review":!amount.safeParse(expected).success?"amount_review":"ready";
  return {id:x.id,title:x.title,startsAt:x.starts_at,taughtOn:x.taughtOn,
   originalOn:x.slot_occurrence_date,timezone:x.timezone,expectedAmountCents:state==="ready"?expected:null,state};
 });
 return {...common,series:[],detail,review:{term:selected,state:"ready" as const,occurrences,
  forecastCents:occurrences.reduce((sum,x)=>sum+(x.expectedAmountCents??0),0)}};
}
type OccurrenceChoice={id:string;title:string;startsAt:string;taughtOn:string;originalOn:string;timezone:string;
 expectedAmountCents:number|null;state:"posted"|"exact_terms"|"attendance_review"|"amount_review"|"ready"};
export async function privateSeriesWrite(db:SupabaseClient,input:z.input<typeof privateSeriesWriteSchema>){
 const v=branches.parse(input);
 const result=v.action==="post"?await db.rpc("ccp_finance_post_private_series_obligation",{
  p_agreement_id:v.agreementId,p_expected_revision:v.expectedRevision,p_expected_amount_cents:v.expectedAmountCents,
  p_session_id:v.sessionId,p_private_series_id:v.privateSeriesId,p_taught_on:v.taughtOn,p_request_id:v.idempotencyKey,p_confirmed:v.confirmed,
 }):await db.rpc("ccp_private_series_compensation_commit",{
  p_workplace:v.action==="terms"?v.workplaceId:null,p_series:v.action==="terms"?v.privateSeriesId:null,
  p_payer:v.action==="terms"?v.billingAccountId:null,p_model:v.action==="terms"?v.model:null,p_rate:v.action==="terms"?v.rateCents:null,
  p_currency:v.action==="terms"?v.currency:null,p_from:v.action==="terms"?v.from:null,p_to:v.action==="terms"?v.to:null,
  p_archive:v.action==="archive"?v.agreementId:null,p_revision:v.action==="archive"?v.expectedRevision:null,
  p_request:v.idempotencyKey,p_confirmed:v.confirmed,
 });
 if(result.error){
  const code=result.error.message;
  if(code==="UNAUTHORIZED")return fail("UNAUTHENTICATED",401);
  const definitive=privateSeriesTerminalCode(result.error);
  if(definitive)return fail(definitive,409);
  if(result.error.code==="23505"&&["PRIVATE_SERIES_REQUEST_CONFLICT","OBLIGATION_REQUEST_CONFLICT"].includes(code))
   return fail(code,409);
  return fail("PRIVATE_SERIES_OUTCOME_UNAVAILABLE",503);
 }
 // Restrict output to one approval receipt; no raw SQL row, hashes or finance metadata.
 const body=result.data;
 if(!body||typeof body.replayed!=="boolean")return fail("PRIVATE_SERIES_OUTCOME_UNAVAILABLE",503);
 if(v.action==="post"){
  const r=body.obligation;
  if(!r)return fail("PRIVATE_SERIES_OUTCOME_UNAVAILABLE",503);
  return {action:v.action,replayed:body.replayed,obligation:{id:r.id,agreementId:r.agreement_id,
   privateSeriesId:v.privateSeriesId,sessionId:r.session_id,taughtOn:r.period_start,amountCents:r.amount_cents,currency:r.currency}};
 }
 return {action:v.action,replayed:body.replayed,term:{id:body.agreementId,privateSeriesId:body.privateSeriesId,
  workplaceId:body.workplaceId,billingAccountId:body.billingAccountId,model:body.model,rateCents:body.rateCents,
  currency:body.currency,from:body.from,to:body.to,status:body.status,revision:body.revision}};
}
