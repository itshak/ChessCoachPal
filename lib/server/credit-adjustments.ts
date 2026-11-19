import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {CoachError} from "@/lib/server/coach-service";

const uuid=z.string().uuid();
export const creditAdjustmentPreviewSchema=z.object({
 packageId:uuid,
}).strict();
export const creditAdjustmentCommitSchema=z.object({
 packageId:uuid,
 kind:z.enum(["manual_grant","forfeiture","refund_entitlement","transfer","expiry_extension"]),
 credits:z.number().int().min(0).max(200),
 expectedBalance:z.number().int().min(0),
 destinationPackageId:uuid.optional(),
 newExpiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 sourcePaymentId:uuid.optional(),
 refundReversalId:uuid.optional(),
 requestId:uuid,
 reason:z.string().trim().min(8).max(1000),
 confirmed:z.literal(true),
}).strict().superRefine((v,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:"custom",message});
 if((v.kind==="expiry_extension")!==(v.credits===0))
  issue("Expiry extension requires zero credits, other changes require positive credits");
 if(v.kind!=="expiry_extension"&&v.credits<1)
  issue("At least one credit must be adjusted");
 if((v.kind==="transfer")!==Boolean(v.destinationPackageId))
  issue("A transfer requires exactly one destination package");
 if((v.kind==="expiry_extension")!==Boolean(v.newExpiresOn))
  issue("Only expiry extension accepts an explicit new expiry date");
 if((v.kind==="refund_entitlement")!==Boolean(v.sourcePaymentId&&v.refundReversalId))
  issue("Refund entitlement requires its previously recorded cash refund evidence");
 if(v.kind!=="refund_entitlement"&&(v.sourcePaymentId||v.refundReversalId))
  issue("Only refund entitlement may bind a payment/refund reversal");
});

export type CreditAdjustmentInput=z.infer<typeof creditAdjustmentCommitSchema>;
type Db=SupabaseClient;
function fail(error:{code?:string;message?:string}){
 if(error.code==="42501")
  throw new CoachError("NOT_FOUND",404,"Credit package or finance evidence not found");
 if(error.code==="23505")
  throw new CoachError("CONFLICT",409,"Credit balance/revision changed or request key reused");
 if(error.code==="23514")
  throw new CoachError("CONFLICT",409,"Insufficient credits, funding or invalid destination/evidence");
 if(error.code==="22023")
  throw new CoachError("VALIDATION_ERROR",400,"Credit adjustment requires explicit reviewed terms");
 throw new CoachError("DATABASE_ERROR",500,"Credit entitlement operation failed");
}

export async function teacherCreditAdjustmentPreview(
 db:Db,teacherId:string,{packageId}:{packageId:string}
){
 void teacherId; // SQL trusts only auth.uid(), never a caller-supplied owner ID.
 const {data,error}=await db.rpc("ccp_credit_adjustment_preview",{
  p_package_id:packageId,
 });
 if(error)fail(error);
 return data;
}

export async function teacherCreditAdjustmentCommit(
 db:Db,teacherId:string,details:CreditAdjustmentInput
){
 void teacherId;
 const args=creditAdjustmentCommitSchema.parse(details);
 const {data,error}=await db.rpc("ccp_credit_adjustment_commit",{
  p_package_id:args.packageId,p_kind:args.kind,
  p_credits:args.credits,p_expected_balance:args.expectedBalance,
  p_destination_package_id:args.destinationPackageId??null,
  p_new_expires_on:args.newExpiresOn??null,
  p_source_payment_id:args.sourcePaymentId??null,
  p_refund_reversal_id:args.refundReversalId??null,
  p_request_id:args.requestId,p_reason:args.reason,p_confirmed:true,
 });
 if(error)fail(error);
 return data;
}
