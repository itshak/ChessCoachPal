import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

const uuid=z.string().uuid();
const date=z.string().date();
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const changes=z.object({
 startTime:time.optional(),
 durationMinutes:z.number().int().min(15).max(480).optional(),
 dayOfWeek:z.number().int().min(0).max(6).optional(),
}).strict().refine(v=>Object.keys(v).length>0,"Provide a changed start time, duration, or bounded weekday");
const fields=z.object({
 slotId:uuid,scope:z.enum(["this_and_future","entire_series"]),
 originalCutoff:date.nullable(),reviewThrough:date,successorId:uuid.nullable(),
 expectedUpdatedAt:z.string().datetime({offset:true}),changes,
}).strict();
const scopeConsistent=(v:z.infer<typeof fields>)=>
 v.slotId!==v.successorId&&((v.scope==="this_and_future"&&v.originalCutoff!==null&&v.originalCutoff<=v.reviewThrough)||
 (v.scope==="entire_series"&&v.originalCutoff===null));
export const recurrencePreviewSchema=fields.refine(scopeConsistent,"Use an original date only with this-and-future scope");
export const recurrenceCommitSchema=fields.extend({
 reviewDigest:z.string().regex(/^[0-9a-f]{64}$/),idempotencyKey:uuid,confirmed:z.literal(true),
}).refine(scopeConsistent,"Use an original date only with this-and-future scope");
type Preview=z.infer<typeof recurrencePreviewSchema>;
type Commit=z.infer<typeof recurrenceCommitSchema>;
export class ProfessionalRecurrenceError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
// Do not expose SQL details or treat an unknown result as proof of rollback.
const denied={
 CANONICAL_SLOT_NOT_FOUND:[404,"Not an owned recurring slot"],
 RECURRENCE_SCOPE_NOT_FOUND:[404,"Not an owned recurring slot"],
 RECURRENCE_SCOPE_WORKPLACE_REQUIRED:[409,"The series workplace is unavailable"],
 RECURRENCE_SCOPE_ENROLLMENT_REQUIRED:[409,"Review the active learner and workplace enrollment"],
 RECURRENCE_SCOPE_REVISION_CONFLICT:[409,"The original rule changed. Refresh and preview again"],
 RECURRENCE_SCOPE_REVIEW_CONFLICT:[409,"Schedule evidence changed. Preview again"],
 RECURRENCE_SCOPE_INVALID_CUTOFF:[400,"Choose an eligible original occurrence date"],
 RECURRENCE_SCOPE_INVALID_RANGE:[400,"Choose a valid explicit review-through date"],
 RECURRENCE_SCOPE_REVIEW_RANGE_INCOMPLETE:[400,"Extend the review through the affected planned occurrences"],
 RECURRENCE_SCOPE_AMBIGUOUS_LOCAL_TIME:[409,"The proposed local time is ambiguous or does not exist"],
 RECURRENCE_SCOPE_PROPOSED_START_PASSED:[409,"The proposed start is no longer in the future"],
 RECURRENCE_SCOPE_EXCEPTION_RECONCILIATION_REQUIRED:[409,"Review existing moves or cancellations before editing this series"],
 RECURRENCE_SCOPE_WEEKDAY_SAME_DAY_UNSUPPORTED:[400,"Weekday edits cannot include today"],
 RECURRENCE_SCOPE_WEEKDAY_COMPLETE_FINITE_RANGE_REQUIRED:[400,"Review the complete finite weekday change"],
 RECURRENCE_SCOPE_WEEKDAY_ORIGINAL_EVIDENCE:[409,"An affected original date already has protected evidence"],
 RECURRENCE_SCOPE_TAIL_ID_REQUIRED:[400,"The approved scope splits a segment; supply a new successor ID"],
 RECURRENCE_SCOPE_INVALID_TARGET:[400,"There are no eligible target segments or a successor is not needed"],
 RECURRENCE_SCOPE_TAIL_CONFLICT:[409,"The successor ID is unavailable; review a new request"],
 RECURRENCE_SCOPE_REPLAY_CONFLICT:[409,"This request ID has a different saved receipt"],
 SESSION_CONFLICT:[409,"The planned lesson overlaps an existing canonical lesson"],
} as const;
const weekdayDateChange=z.object({
 sourceSlotId:uuid,targetSlotId:uuid,oldOriginalDates:z.array(date).min(1).max(54),
 newOriginalDates:z.array(date).min(1).max(54),
});
const previewReceipt=z.object({
 seriesId:uuid,anchorId:uuid,scope:z.enum(["this_and_future","entire_series"]),
 successorId:uuid.nullable(),cutoff:date,reviewThrough:date,reviewDigest:z.string().regex(/^[0-9a-f]{64}$/),
 sourceRevision:z.string().datetime({offset:true}),planned:z.number().int().nonnegative(),
 affectedSegments:z.number().int().nonnegative(),replaceableDrafts:z.number().int().nonnegative(),
 preservedHistory:z.number().int().nonnegative(),
 weekdayDateChanges:z.array(weekdayDateChange).max(64).optional(),
});
const commitReceipt=previewReceipt.extend({
 idempotencyKey:uuid,removedFutureDrafts:z.number().int().nonnegative(),replayed:z.boolean(),
});
function args(input:Preview){
 return {p_slot_id:input.slotId,p_scope:input.scope,p_cutoff:input.originalCutoff,p_tail_id:input.successorId,
  p_changes:input.changes,p_to:input.reviewThrough,p_expected_updated_at:input.expectedUpdatedAt};
}
function reject(error:{message:string}){
 const key=error.message;
 if(Object.hasOwn(denied,key)){
  const [status,message]=denied[key as keyof typeof denied];
  throw new ProfessionalRecurrenceError(status,key,message);
 }
 throw new ProfessionalRecurrenceError(503,"RECURRENCE_UNAVAILABLE","The operation could not be verified");
}
export async function previewProfessionalRecurrence(db:SupabaseClient,input:Preview){
 const {data,error}=await db.rpc("ccp_canonical_slot_edit_scoped",{
  ...args(input),p_review_digest:null,p_idempotency_key:null,p_confirmed:false,
 });
 if(error)reject(error);
 const review=previewReceipt.safeParse(data);
 if(!review.success||(input.changes.dayOfWeek!==undefined&&review.data.weekdayDateChanges===undefined))throw new ProfessionalRecurrenceError(503,"RECURRENCE_UNAVAILABLE","The review could not be verified");
 return {...review.data,changes:input.changes,requiresExplicitApproval:true,writesPerformed:false};
}
export async function commitProfessionalRecurrence(db:SupabaseClient,input:Commit){
 const {data,error}=await db.rpc("ccp_canonical_slot_edit_scoped",{
  ...args(input),p_review_digest:input.reviewDigest,p_idempotency_key:input.idempotencyKey,p_confirmed:true,
 });
 if(error)reject(error);
 const receipt=commitReceipt.safeParse(data);
 if(!receipt.success||(input.changes.dayOfWeek!==undefined&&receipt.data.weekdayDateChanges===undefined))throw new ProfessionalRecurrenceError(503,"RECURRENCE_UNAVAILABLE","The receipt could not be verified");
 return receipt.data;
}
