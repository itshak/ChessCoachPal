import type { SupabaseClient } from "@supabase/supabase-js";
import {getPolicy} from "@/lib/server/scheduling";
import {expireCheckoutSession} from "@/lib/payments";
import {resolveManualPaymentAmount,summarizePayments} from "@/lib/billing";

type Db=SupabaseClient;
export class ManualPaymentError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(s:number,c:string,m:string)=>new ManualPaymentError(s,c,m);
export type ManualPaymentInput={
 amountCents?:number|null;note?:string;idempotencyKey?:string;
};
const invoiceSelect="id,status,subtotal_cents,stripe_checkout_session_id,stripe_checkout_url,payments(id,amount_cents,method,note,external_id)";
type PaymentRecord={id:string;amount_cents:number;method:string;note:string;external_id:string|null};
async function invoiceForPayment(db:Db,teacherId:string,id:string){
 const {data,error}=await db.from("invoices").select(invoiceSelect)
  .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw fail(500,"DATABASE_ERROR","Invoice lookup failed");
 if(!data)throw fail(404,"NOT_FOUND","Invoice not found");
 return data;
}
export async function teacherManualPaymentRecord(db:Db,teacherId:string,id:string,input:ManualPaymentInput){
 const invoice=await invoiceForPayment(db,teacherId,id);
 const payments=(invoice.payments??[]) as PaymentRecord[];
 const key=input.idempotencyKey? `mcp:${input.idempotencyKey}`:null;
 const note=typeof input.note==="string"?input.note.trim().slice(0,500):"";
 if(input.idempotencyKey!==undefined&&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey))
  throw fail(400,"VALIDATION_ERROR","Payment idempotencyKey must be a UUID");
 // A saved receipt always wins over the current balance. Retrying a settled
 // payment must return its original ID, not add another payment or report
 // a misleading new settlement.
 if(key){
  const replay=payments.find(p=>p.external_id===key);
  if(replay){
   if(replay.note!==note||input.amountCents!=null&&replay.amount_cents!==input.amountCents)
    throw fail(409,"IDEMPOTENCY_CONFLICT","This idempotency key was already used with different payment details");
   return {ok:true,replayed:true,paymentId:replay.id,amountCents:replay.amount_cents};
  }
 }
 if(invoice.status==="void")throw fail(409,"CONFLICT","Cannot pay a void invoice");
 const before=summarizePayments(invoice.subtotal_cents,
   payments.map(p=>({amountCents:p.amount_cents})));
 if(invoice.status==="paid"&&before.settled)return {ok:true,alreadyPaid:true};
 const requested=input.amountCents??null;
 if(requested!==null&&(!Number.isSafeInteger(requested)||requested<=0))
  throw fail(400,"VALIDATION_ERROR","Payment amount must be whole positive cents");
 if(invoice.status==="draft"&&requested!==null)
  throw fail(409,"CONFLICT","Send an invoice before making a partial payment");
 const amount=resolveManualPaymentAmount(requested,before.balanceCents);
 if(!amount.ok)throw fail(400,"VALIDATION_ERROR",amount.error);
 // Retire external Checkout BEFORE touching financial rows. If it is complete
 // or its status is unknown, refuse rather than risking a double charge.
 // The SQL transaction rechecks the EXACT invoice session ID and makes
 // clearing the link, payment INSERT and status change all-or-nothing.
 const expectedSession=invoice.stripe_checkout_session_id as string|null;
 if(expectedSession||invoice.stripe_checkout_url){
  if(!expectedSession)
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","An invoice payment link needs provider reconciliation before recording cash");
  const policy=await getPolicy(db,teacherId);
  if(!policy.stripe_secret_key)
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Reconnect Stripe and retire the Checkout link before recording a manual payment");
  try{await expireCheckoutSession(policy.stripe_secret_key,expectedSession);}
  catch{
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Could not safely retire Stripe Checkout; verify provider payment before recording cash");
  }
 }
 const {data,error}=await db.rpc("ccp_manual_payment_commit",{
  p_invoice_id:id,p_amount_cents:requested,p_note:note,
  p_request_id:input.idempotencyKey??null,
  p_expected_checkout_session:expectedSession,
 });
 if(error){
  if(error.code==="23505"||error.message.includes("MANUAL_PAYMENT_REQUEST_CONFLICT"))
   throw fail(409,"IDEMPOTENCY_CONFLICT","Payment idempotency key was already used with different details");
  if(/CHECKOUT_RECONCILIATION_REQUIRED|STRIPE_PAYMENT_RECONCILIATION_REQUIRED/.test(error.message))
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Invoice payment provider state changed; reconcile Checkout before recording cash");
  if(/INVOICE_VOID|PARTIAL_DRAFT_PAYMENT/.test(error.message))
   throw fail(409,"CONFLICT","Invoice state changed; refresh before recording payment");
  if(/INVALID_MANUAL_PAYMENT|INVOICE_NOTHING_OWED|INVALID_MANUAL_PAYMENT_AMOUNT/.test(error.message))
   throw fail(400,"VALIDATION_ERROR","Payment amount exceeds the remaining invoice balance");
  if(error.code==="42501")throw fail(404,"NOT_FOUND","Invoice not found");
  throw fail(500,"DATABASE_ERROR","Payment could not be recorded; no partial payment was saved");
 }
 if(!data||typeof data!=="object"||Array.isArray(data))
  throw fail(500,"DATABASE_ERROR","Payment transaction returned invalid data");
 return data as Record<string,unknown>;
}

export async function teacherManualPaymentDelete(db:Db,teacherId:string,invoiceId:string,paymentId:string){
 const invoice=await invoiceForPayment(db,teacherId,invoiceId);
 if(invoice.status==="void")throw fail(409,"CONFLICT","Void invoice payments cannot be removed");
 const payment=((invoice.payments??[]) as PaymentRecord[]).find(p=>p.id===paymentId);
 if(!payment)throw fail(404,"NOT_FOUND","Payment not found for this invoice");
 if(payment.method!=="manual")
  throw fail(409,"STRIPE_REFUND_REQUIRED","Stripe payments can only be refunded through Stripe");
 const {data,error}=await db.from("payments").delete().eq("id",paymentId)
  .eq("invoice_id",invoiceId).select("id");
 if(error)throw fail(500,"DATABASE_ERROR","Could not remove payment");
 if(!data?.length)throw fail(409,"CONFLICT","Payment was already changed");
 const {data:updated,error:lookup}=await db.from("invoices").select("status")
  .eq("id",invoiceId).eq("teacher_id",teacherId).maybeSingle();
 if(lookup)throw fail(500,"DATABASE_ERROR","Payment removed; unable to verify invoice state");
 return {ok:true,status:updated?.status??null};
}
