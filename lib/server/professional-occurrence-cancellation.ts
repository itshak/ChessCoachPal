import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {zonedTimeToUtc} from "@/lib/schedule";

const uuid=z.string().uuid(),date=z.string().date(),instant=z.string().datetime({offset:true});
const revision=z.string().regex(/^[1-9][0-9]{0,18}$/)
 .refine(v=>v.length<19||v<="9223372036854775807","Invalid cancellation revision");
const reason=z.string().trim().refine(v=>Array.from(v).length>=4&&Array.from(v).length<=500);
const target=z.object({slotId:uuid,originalOccurrenceOn:date}).strict();
const cancelReview=target.extend({action:z.literal("cancel"),expectedUpdatedAt:instant,reason});
const restoreReview=target.extend({action:z.literal("restore")});
const approval={idempotencyKey:uuid,confirmed:z.literal(true)};
const cancelCommit=cancelReview.extend(approval);
const restoreCommit=z.object({action:z.literal("restore"),exceptionId:uuid,expectedRevision:revision,...approval}).strict();
export const occurrenceCancellationPreviewSchema=z.discriminatedUnion("action",[cancelReview,restoreReview]);
export const occurrenceCancellationCommitSchema=z.discriminatedUnion("action",[cancelCommit,restoreCommit]);
// MCP advertises an object at the root. The same strict tagged unions
// enforce the exact allowed fields for each action on both transports.
const mcpAction=z.enum(["cancel","restore"]);
export const occurrenceCancellationMcpPreviewSchema=target.extend({
 action:mcpAction,expectedUpdatedAt:instant.optional(),reason:reason.optional(),
}).refine(v=>occurrenceCancellationPreviewSchema.safeParse(v).success);
export const occurrenceCancellationMcpCommitSchema=z.object({
 action:mcpAction,slotId:uuid.optional(),originalOccurrenceOn:date.optional(),
 expectedUpdatedAt:instant.optional(),reason:reason.optional(),exceptionId:uuid.optional(),
 expectedRevision:revision.optional(),...approval,
}).strict().refine(v=>occurrenceCancellationCommitSchema.safeParse(v).success);

const commonReceipt=z.object({exceptionId:uuid,slotId:uuid,originalOccurrenceOn:date,idempotencyKey:uuid,replayed:z.boolean()});
const cancelReceipt=commonReceipt.extend({slotRevision:instant});
const restoreReceipt=commonReceipt.extend({revokedAt:instant});

export class ProfessionalOccurrenceCancellationError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failures={
 CANONICAL_SLOT_NOT_FOUND:[404,"Recurring rule not found"],
 CANONICAL_SLOT_WORKPLACE_NOT_FOUND:[409,"The rule's workplace is unavailable"],
 CANONICAL_SLOT_REVISION_CONFLICT:[409,"The rule changed. Refresh and review again"],
 SLOT_OCCURRENCE_ALREADY_MATERIALIZED:[409,"Use the existing lesson's own actions"],
 SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION:[409,"This original date already has an exception"],
 SLOT_CANCELLATION_NOT_A_RULE_DATE:[400,"Choose a date in this rule"],
 SLOT_CANCELLATION_NOT_FUTURE:[409,"The date has no remaining eligible start"],
 INVALID_SLOT_CANCELLATION:[400,"Invalid cancellation"],
 INVALID_SLOT_CANCELLATION_REVOCATION:[400,"Invalid cancellation restoration"],
 SLOT_CANCELLATION_REPLAY_CONFLICT:[409,"A different request already used this ID"],
 SLOT_CANCELLATION_REVOCATION_REPLAY_CONFLICT:[409,"A different request already used this ID"],
 SLOT_CANCELLATION_NOT_FOUND:[404,"No active cancellation found for this exact date"],
 SLOT_CANCELLATION_ALREADY_REVOKED:[409,"This cancellation was already restored"],
 SLOT_CANCELLATION_REVISION_CONFLICT:[409,"This cancellation changed. Review it again"],
 SLOT_CANCELLATION_REVOCATION_NOT_SUPPORTED:[409,"Only an unmaterialized cancellation can be restored"],
} as const;
function reject(code:string):never{
 if(Object.hasOwn(failures,code)){
  const [status,message]=failures[code as keyof typeof failures];
  throw new ProfessionalOccurrenceCancellationError(status,code,message);
 }
 throw new ProfessionalOccurrenceCancellationError(503,"OCCURRENCE_CANCELLATION_UNAVAILABLE","The result could not be verified");
}

// A signed RLS read describes the current original date, not a reservation.
// The canonical command rechecks eligibility and revision under the teacher lock.
export async function previewProfessionalOccurrenceCancellation(db:SupabaseClient,teacherId:string,
 input:z.infer<typeof occurrenceCancellationPreviewSchema>){
 const {data:slot,error}=await db.from("lesson_slots")
  .select("id,series_id,updated_at,start_date,end_date,day_of_week,active,start_time,duration_minutes,workplace_id")
  .eq("id",input.slotId).eq("teacher_id",teacherId).maybeSingle();
 if(error)reject(error.message);
 if(!slot)reject("CANONICAL_SLOT_NOT_FOUND");
 if(input.action==="cancel"&&slot.updated_at!==input.expectedUpdatedAt){
  const {data:matching,error}=await db.from("lesson_slots").select("id")
   .eq("id",slot.id).eq("teacher_id",teacherId).eq("updated_at",input.expectedUpdatedAt)
   .eq("updated_at",slot.updated_at).maybeSingle();
  if(error)reject(error.message);
  if(!matching)reject("CANONICAL_SLOT_REVISION_CONFLICT");
 }
 const day=new Date(input.originalOccurrenceOn+"T12:00:00Z").getUTCDay();
 if(!slot.active||slot.duration_minutes<15||slot.duration_minutes>480||
    !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(slot.start_time)||day!==slot.day_of_week||input.originalOccurrenceOn<slot.start_date||
    (slot.end_date&&input.originalOccurrenceOn>slot.end_date))reject("SLOT_CANCELLATION_NOT_A_RULE_DATE");
 const workplaceQuery=db.from("workplaces").select("timezone,archived_at").eq("teacher_id",teacherId);
 const {data:workplace,error:workplaceError}=await (slot.workplace_id
  ?workplaceQuery.eq("id",slot.workplace_id)
  :workplaceQuery.order("created_at").order("id").limit(1)).maybeSingle();
 if(workplaceError)reject(workplaceError.message);
 if(!workplace||workplace.archived_at!==null)reject("CANONICAL_SLOT_WORKPLACE_NOT_FOUND");
 let zone=workplace.timezone;
 if(slot.workplace_id===null){
  const {data:prefs,error:settingsError}=await db.from("teacher_settings").select("timezone")
   .eq("teacher_id",teacherId).maybeSingle();
  if(settingsError)reject(settingsError.message);
  zone=prefs?.timezone||zone;
 }
 let startsAt:number;
 try{startsAt=zonedTimeToUtc(input.originalOccurrenceOn,slot.start_time,zone,"reject").getTime();}
 catch{reject("SLOT_CANCELLATION_NOT_FUTURE");}
 if(startsAt<=Date.now())reject("SLOT_CANCELLATION_NOT_FUTURE");
 // Use physical IDs from the exact owned series, including older segments.
 // Keep each filter short and fail closed if the response hits its cap.
 const {data:segments,error:seriesError}=await db.from("lesson_slots").select("id")
  .eq("teacher_id",teacherId).eq("series_id",slot.series_id).limit(1000);
 if(seriesError)reject(seriesError.message);
 if(!segments?.length||segments.length>=1000)reject("INCOMPLETE_SERIES");
 let cancellation:{id:string;action:string;session_id:string|null;revision:string}|null=null;
 for(let i=0;i<segments.length;i+=100){
  const ids=segments.slice(i,i+100).map(s=>String(s.id));
  const [lesson,exceptions]=await Promise.all([
   db.from("teaching_sessions").select("id").eq("teacher_id",teacherId)
    .in("slot_id",ids).eq("slot_occurrence_date",input.originalOccurrenceOn).limit(1),
   db.from("slot_occurrence_exceptions").select("id,action,session_id,revision::text")
    .eq("teacher_id",teacherId).in("slot_id",ids)
    .eq("original_occurrence_on",input.originalOccurrenceOn).is("revoked_at",null).limit(2),
  ]);
  if(lesson.error||exceptions.error)reject("UNVERIFIED_ORIGINAL_DATE");
  if(lesson.data?.length)reject("SLOT_OCCURRENCE_ALREADY_MATERIALIZED");
  for(const candidate of exceptions.data??[]){
   if(input.action==="cancel"||cancellation)reject("SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION");
   cancellation=candidate;
  }
 }
 const facts={originalOccurrenceOn:input.originalOccurrenceOn,requiresExplicitApproval:true,writesPerformed:false};
 if(input.action==="cancel")return {...facts,action:"cancel" as const,slotId:slot.id,expectedUpdatedAt:slot.updated_at};
 if(!cancellation)reject("SLOT_CANCELLATION_NOT_FOUND");
 if(cancellation.action!=="cancel"||cancellation.session_id!==null)reject("SLOT_CANCELLATION_REVOCATION_NOT_SUPPORTED");
 const parsed=revision.safeParse(cancellation.revision);
 if(!parsed.success)reject("UNVERIFIED_CANCELLATION_REVISION");
 return {...facts,action:"restore" as const,exceptionId:cancellation.id,expectedRevision:parsed.data};
}

export async function commitProfessionalOccurrenceCancellation(db:SupabaseClient,
 input:z.infer<typeof occurrenceCancellationCommitSchema>){
 if(input.action==="cancel"){
  const {data,error}=await db.rpc("ccp_canonical_slot_cancel_unmaterialized",{
   p_slot_id:input.slotId,p_original_occurrence_on:input.originalOccurrenceOn,
   p_expected_updated_at:input.expectedUpdatedAt,p_idempotency_key:input.idempotencyKey,
   p_reason:input.reason,p_confirmed:input.confirmed,
  });
  if(error)reject(error.message);
  const result=cancelReceipt.safeParse(data);
  if(!result.success)reject("UNVERIFIED_CANCELLATION");
  return {...result.data,action:input.action};
 }
 const {data,error}=await db.rpc("ccp_canonical_slot_revoke_unmaterialized_cancellation",{
  p_exception_id:input.exceptionId,p_expected_revision:input.expectedRevision,
  p_idempotency_key:input.idempotencyKey,p_confirmed:input.confirmed,
 });
 if(error)reject(error.message);
 const result=restoreReceipt.safeParse(data);
 if(!result.success)reject("UNVERIFIED_RESTORATION");
 return {...result.data,action:input.action};
}
