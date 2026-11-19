import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";

/**
 * Native immutable ledger. The shared SQL RPCs serialize approvals, receipts,
 * allocations and reversals; neither the UI nor an MCP model can insert directly
 * or infer that an invoice/lesson is evidence of received money.
 */
const uuid=z.string().uuid();
const cents=z.number().int().min(1).max(1_000_000_000);
const date=z.iso.date();
export const financialObligationApproveSchema=z.object({
 agreementId:uuid,expectedRevision:z.number().int().min(1),
 expectedAmountCents:cents,sessionId:uuid.nullable().default(null),
 studentId:uuid.nullable().default(null),
 periodStart:date,periodEnd:date,
 idempotencyKey:uuid,confirmed:z.literal(true),
}).strict().refine(x=>x.periodEnd>=x.periodStart,"Invalid financial period");
export const receivedPaymentRecordSchema=z.object({
 billingAccountId:uuid,currency:z.string().regex(/^[A-Z]{3}$/),
 amountCents:cents,receivedAt:z.iso.datetime({offset:true}),
 method:z.enum(["cash","bank_transfer","card","other"]),
 externalReference:z.string().max(240).nullable().default(null),
 idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const paymentAllocationSchema=z.object({
 receivedPaymentId:uuid,obligationId:uuid,
 amountCents:cents,idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();
export const financialReversalSchema=z.object({
 kind:z.enum(["allocation_reversal","payment_refund","obligation_correction"]),
 targetId:uuid,amountCents:cents,reason:z.string().trim().min(3).max(1000),
 idempotencyKey:uuid,confirmed:z.literal(true),
}).strict();

export class FinanceLedgerError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const publicCodes=new Set([
 "INVALID_OBLIGATION_APPROVAL","AGREEMENT_NOT_ACTIVE_OR_OWNED",
 "STALE_AGREEMENT_REVISION","FIXED_PERIOD_MONTH_REQUIRED",
 "CANONICAL_SESSION_REQUIRED","COMPLETED_SESSION_NOT_OWNED",
 "AGREEMENT_GROUP_MISMATCH","AGREEMENT_DATE_MISMATCH",
 "UNCONFIRMED_OR_NO_SHOW_ATTENDANCE","AGREEMENT_STUDENT_NOT_ATTENDED",
 "PARTICIPANT_CHARGE_REQUIRES_ATTENDED_STUDENT",
 "EXPLICIT_PAYER_ASSIGNMENT_REQUIRED","COACH_OCCURRENCE_HAS_NO_STUDENT_CHARGE",
 "OBLIGATION_AMOUNT_CHANGED_REPREVIEW","OBLIGATION_REQUEST_CONFLICT",
 "INVALID_PAYMENT_CONFIRMATION","BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED",
 "PAYMENT_REQUEST_CONFLICT","INVALID_ALLOCATION_CONFIRMATION",
 "PAYMENT_NOT_OWNED","OBLIGATION_NOT_OWNED",
 "PAYMENT_COUNTERPARTY_OR_CURRENCY_MISMATCH","PAYMENT_OVERALLOCATION",
 "ALLOCATION_REQUEST_CONFLICT","INVALID_FINANCIAL_REVERSAL",
 "ALLOCATION_NOT_OWNED","ALLOCATION_REVERSAL_EXCEEDS_POSTED_AMOUNT",
 "PAYMENT_REFUND_EXCEEDS_UNALLOCATED_BALANCE",
 "OBLIGATION_CORRECTION_EXCEEDS_UNSETTLED_BALANCE",
 "REVERSAL_REQUEST_CONFLICT","UNAUTHORIZED",
]);
export function financeLedgerDbError(error:{code?:string;message:string}):never{
 const code=[...publicCodes].find(x=>error.message.includes(x));
 if(code){
  const status=code==="UNAUTHORIZED"||code.endsWith("_NOT_OWNED")||
   code==="AGREEMENT_NOT_ACTIVE_OR_OWNED"||
   code==="BILLING_ACCOUNT_NOT_ACTIVE_OR_OWNED"?403:
   code.startsWith("INVALID_")||code==="FIXED_PERIOD_MONTH_REQUIRED"||
   code==="CANONICAL_SESSION_REQUIRED"?400:409;
  throw new FinanceLedgerError(status,code,code.replaceAll("_"," ").toLowerCase());
 }
 if(error.code==="23505")throw new FinanceLedgerError(409,"FINANCIAL_CONFLICT",
  "A financial source or request was already posted; refresh and review");
 if(error.code==="23514")throw new FinanceLedgerError(409,"FINANCIAL_CONSTRAINT",
  "The financial request conflicts with an immutable ledger constraint");
 if(error.code==="42501")throw new FinanceLedgerError(403,"FORBIDDEN",
  "This financial record is not available to the current teacher");
 throw new FinanceLedgerError(500,"DATABASE_ERROR","Financial record unavailable");
}
async function rpc(db:SupabaseClient,fn:string,params:Record<string,unknown>){
 const {data,error}=await db.rpc(fn,params);
 if(error)financeLedgerDbError(error);
 return data;
}
type Approval=z.input<typeof financialObligationApproveSchema>;
type Payment=z.input<typeof receivedPaymentRecordSchema>;
type Allocation=z.input<typeof paymentAllocationSchema>;
type Reversal=z.input<typeof financialReversalSchema>;

export async function financialObligationApprove(db:SupabaseClient,_teacherId:string,input:Approval){
 const a=financialObligationApproveSchema.parse(input);
 return rpc(db,"ccp_finance_post_obligation",{
  p_agreement_id:a.agreementId,p_expected_revision:a.expectedRevision,
  p_expected_amount_cents:a.expectedAmountCents,p_session_id:a.sessionId,
  p_student_id:a.studentId,p_period_start:a.periodStart,p_period_end:a.periodEnd,
  p_request_id:a.idempotencyKey,p_confirmed:a.confirmed,
 });
}
export async function receivedPaymentRecord(db:SupabaseClient,_teacherId:string,input:Payment){
 const a=receivedPaymentRecordSchema.parse(input);
 return rpc(db,"ccp_finance_record_payment",{
  p_billing_account_id:a.billingAccountId,p_currency:a.currency,
  p_amount_cents:a.amountCents,p_received_at:a.receivedAt,
  p_method:a.method,p_external_reference:a.externalReference,
  p_request_id:a.idempotencyKey,
 });
}
export async function paymentAllocate(db:SupabaseClient,_teacherId:string,input:Allocation){
 const a=paymentAllocationSchema.parse(input);
 return rpc(db,"ccp_finance_allocate_payment",{
  p_received_payment_id:a.receivedPaymentId,p_obligation_id:a.obligationId,
  p_amount_cents:a.amountCents,p_request_id:a.idempotencyKey,
 });
}
export async function financialReverse(db:SupabaseClient,_teacherId:string,input:Reversal){
 const a=financialReversalSchema.parse(input);
 return rpc(db,"ccp_finance_reverse",{
  p_kind:a.kind,p_target_id:a.targetId,p_amount_cents:a.amountCents,
  p_reason:a.reason,p_request_id:a.idempotencyKey,
 });
}
/** Bounded, tenant-scoped readback; never exposes hashes, tokens or credentials. */
export async function financeLedgerList(db:SupabaseClient,teacherId:string){
 const [obligations,payments,allocations,reversals]=await Promise.all([
  db.from("financial_obligations")
   .select("id,workplace_id,billing_account_id,agreement_id,agreement_revision,session_id,student_id,period_start,period_end,kind,amount_cents,currency,created_at")
   .eq("teacher_id",teacherId).order("created_at",{ascending:false}).limit(100),
  db.from("received_payments")
   .select("id,billing_account_id,currency,amount_cents,received_at,method,provenance,external_reference,created_at")
   .eq("teacher_id",teacherId).order("created_at",{ascending:false}).limit(100),
  db.from("payment_allocations")
   .select("id,received_payment_id,obligation_id,amount_cents,created_at")
   .eq("teacher_id",teacherId).order("created_at",{ascending:false}).limit(100),
  db.from("financial_reversals")
   .select("id,kind,allocation_id,received_payment_id,obligation_id,amount_cents,reason,created_at")
   .eq("teacher_id",teacherId).order("created_at",{ascending:false}).limit(100),
 ]);
 const error=[obligations.error,payments.error,allocations.error,reversals.error].find(Boolean);
 if(error)financeLedgerDbError(error);
 return {
  obligations:obligations.data??[],
  receivedPayments:payments.data??[],
  allocations:allocations.data??[],
  reversals:reversals.data??[],
  limitPerCategory:100,
  note:"Gross obligation and received-payment amounts are separate. Apply recorded reversals and allocations to determine net open balances; no invoice or tax receipt is implied.",
 };
}
