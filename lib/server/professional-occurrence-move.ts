import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

const uuid=z.string().uuid(), date=z.string().date(), instant=z.string().datetime({offset:true});
const digest=z.string().regex(/^[0-9a-f]{64}$/);
export const occurrenceMovePreviewSchema=z.object({
 slotId:uuid,originalOccurrenceOn:date,revisedDate:date,
 revisedTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
 expectedUpdatedAt:instant,reason:z.string().trim().min(4).max(500),
}).strict();
export const occurrenceMoveCommitSchema=occurrenceMovePreviewSchema.extend({
 reviewDigest:digest,idempotencyKey:uuid,confirmed:z.literal(true),
});
const review=z.object({slotId:uuid,seriesId:uuid,originalOccurrenceOn:date,originalStartsAt:instant,
 revisedStartsAt:instant,timezone:z.string().min(1).max(100),durationMinutes:z.number().int().positive(),
 slotRevision:instant,reviewDigest:digest});
const receipt=review.extend({sessionId:uuid,exceptionId:uuid,idempotencyKey:uuid,replayed:z.boolean()});
export class ProfessionalOccurrenceMoveError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const known={
 CANONICAL_SLOT_NOT_FOUND:[404,"Recurring rule not found"],
 CANONICAL_SLOT_REVISION_CONFLICT:[409,"The rule changed. Refresh and review again"],
 CANONICAL_SLOT_WORKPLACE_NOT_FOUND:[404,"The rule's workplace is unavailable"],
 SLOT_RESCHEDULE_NOT_A_RULE_DATE:[400,"Choose an actual date in this rule"],
 SLOT_RESCHEDULE_AMBIGUOUS_LOCAL_TIME:[409,"The original or proposed local time is ambiguous or does not exist"],
 SLOT_RESCHEDULE_INVALID_TIME:[400,"Both times must be future and distinct"],
 SLOT_RESCHEDULE_ENROLLMENT_REQUIRED:[409,"Review the active learner and applicable membership"],
 SLOT_OCCURRENCE_ALREADY_MATERIALIZED:[409,"Use the existing lesson's reschedule action"],
 SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION:[409,"This original date already has an exception"],
 SLOT_RESCHEDULE_REVIEW_CONFLICT:[409,"The reviewed evidence changed. Preview again"],
 SLOT_RESCHEDULE_REPLAY_CONFLICT:[409,"A different request already used this ID"],
 SESSION_CONFLICT:[409,"The chosen time overlaps another lesson"],
} as const;
function reject(error:{message:string}):never{
 if(Object.hasOwn(known,error.message)){
  const [status,message]=known[error.message as keyof typeof known];
  throw new ProfessionalOccurrenceMoveError(status,error.message,message);
 }
 throw new ProfessionalOccurrenceMoveError(503,"OCCURRENCE_MOVE_UNAVAILABLE","The result could not be verified");
}
async function move(db:SupabaseClient,input:z.infer<typeof occurrenceMovePreviewSchema>,approved?:{
 digest:string;key:string;
}){
 const {data,error}=await db.rpc("ccp_canonical_reschedule_unmaterialized_slot",{
  p_slot_id:input.slotId,p_original_occurrence_on:input.originalOccurrenceOn,
  p_revised_date:input.revisedDate,p_revised_time:input.revisedTime,
  p_expected_updated_at:input.expectedUpdatedAt,p_reason:input.reason,
  p_review_digest:approved?.digest??null,p_idempotency_key:approved?.key??null,p_confirmed:!!approved,
 });
 if(error)reject(error);
 return data;
}
export async function previewProfessionalOccurrenceMove(db:SupabaseClient,input:z.infer<typeof occurrenceMovePreviewSchema>){
 const parsed=review.safeParse(await move(db,input));
 if(!parsed.success)throw new ProfessionalOccurrenceMoveError(503,"OCCURRENCE_MOVE_UNAVAILABLE","The review could not be verified");
 return {...parsed.data,requiresExplicitApproval:true,writesPerformed:false};
}
export async function commitProfessionalOccurrenceMove(db:SupabaseClient,input:z.infer<typeof occurrenceMoveCommitSchema>){
 const parsed=receipt.safeParse(await move(db,input,{digest:input.reviewDigest,key:input.idempotencyKey}));
 if(!parsed.success)throw new ProfessionalOccurrenceMoveError(503,"OCCURRENCE_MOVE_UNAVAILABLE","The receipt could not be verified");
 return parsed.data;
}
