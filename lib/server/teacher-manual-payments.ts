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
 const key=input.idempotencyKey?`mcp:${input.idempotencyKey}`:null;
 const note=typeof input.note==="string"?input.note.trim().slice(0,500):"";
 if(key){
  const replay=payments.find(p=>p.external_id===key);
  if(replay){
   if(replay.note!==note||input.amountCents!=null&&replay.amount_cents!==input.amountCents)
    throw fail(409,"IDEMPOTENCY_CONFLICT","This idempotency key was already used with different payment details");
   return {ok:true,replayed:true,paymentId:replay.id,amountCents:replay.amount_cents};
  }
 }
 if(invoice.status==="void")throw fail(409,"CONFLICT","Cannot pay a void invoice");
 const amounts=payments.map(p=>({amountCents:p.amount_cents}));
 const before=summarizePayments(invoice.subtotal_cents,amounts);
 if(invoice.status==="paid"&&before.settled)return {ok:true,alreadyPaid:true};
 const requested=input.amountCents??null;
 if(requested!==null&&(!Number.isSafeInteger(requested)||requested<0))
  throw fail(400,"VALIDATION_ERROR","Payment amount must be whole nonnegative cents");
 if(invoice.status==="draft"&&requested!==null)
  throw fail(409,"CONFLICT","Send an invoice before making a partial payment");
 const amount=resolveManualPaymentAmount(requested,before.balanceCents);
 if(!amount.ok)throw fail(400,"VALIDATION_ERROR",amount.error);
 // A manual receipt may not coexist with a live Stripe payment link.
 // Retire the provider session BEFORE inserting money; a completed/unknown
 // session or missing provider credentials blocks the entire operation.
 // Clearing the persisted link ahead of insertion is safe: a failed insert
 // leaves an expired (not payable) Checkout link, never an orphaned charge.
 if(invoice.stripe_checkout_session_id||invoice.stripe_checkout_url){
  if(!invoice.stripe_checkout_session_id)
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","An invoice payment link needs provider reconciliation before recording cash");
  const policy=await getPolicy(db,teacherId);
  if(!policy.stripe_secret_key)
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Reconnect Stripe and retire the Checkout link before recording a manual payment");
  try{await expireCheckoutSession(policy.stripe_secret_key,invoice.stripe_checkout_session_id);}
  catch{
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Could not safely retire Stripe Checkout; verify provider payment before recording cash");
  }
  const {data:cleared,error:clearError}=await db.from("invoices")
   .update({stripe_checkout_session_id:null,stripe_checkout_url:null})
   .eq("id",id).eq("teacher_id",teacherId)
   .eq("stripe_checkout_session_id",invoice.stripe_checkout_session_id)
   .in("status",["draft","sent"]).select("id").maybeSingle();
  if(clearError||!cleared)
   throw fail(409,"CHECKOUT_RECONCILIATION_REQUIRED","Invoice changed while retiring Stripe Checkout; refresh before recording payment");
 }
 const {data:record,error:recordError}=await db.from("payments").insert({
  invoice_id:id,amount_cents:amount.amountCents,method:"manual",note,
  ...(key?{external_id:key}:{}),
 }).select("id").single();
 if(recordError?.code==="23505"&&key){
  const latest=await invoiceForPayment(db,teacherId,id);
  const replay=((latest.payments??[]) as PaymentRecord[]).find(p=>p.external_id===key);
  if(replay&&replay.note===note&&(requested===null||replay.amount_cents===requested))
   return {ok:true,replayed:true,paymentId:replay.id,amountCents:replay.amount_cents};
  throw fail(409,"IDEMPOTENCY_CONFLICT","Payment key already in use");
 }
 if(recordError||!record)throw fail(500,"DATABASE_ERROR","Payment could not be recorded");
 const after=summarizePayments(invoice.subtotal_cents,[
  ...amounts,{amountCents:amount.amountCents},
 ]);
 if(after.settled){
  const {error}=await db.from("invoices").update({
   status:"paid",paid_at:new Date().toISOString(),payment_method:"manual",
  }).eq("id",id).eq("teacher_id",teacherId);
  if(error)throw fail(500,"DATABASE_ERROR","Payment recorded, but invoice status update failed; reconcile payment before retry");
 }
 return {ok:true,paid:after.settled,balanceCents:after.balanceCents,
  paymentId:record.id,amountCents:amount.amountCents};
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
