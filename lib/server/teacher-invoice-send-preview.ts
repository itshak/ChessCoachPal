import type {SupabaseClient} from "@supabase/supabase-js";
import {loadInvoicePdf} from "@/lib/server/invoice-pdf-data";
import {familyEmailRecipients,familyGreetingNames} from "@/lib/guardians";
import {familyCommunicationLocale} from "@/lib/server/communication-locales";
import {buildInvoiceEmailContent} from "@/lib/server/invoice-email-content";
import {isValidPaymentQrDataUrl} from "@/lib/payment-qr";
import {summarizePayments} from "@/lib/billing";

/** Safe, non-mutating preview for the same draft/PDF gate used by sendInvoice.
 * Neither the PDF, provider keys, Stripe URLs nor guardian portal tokens
 * are returned. Recipients require confirmed contact visibility. */
export class InvoiceSendPreviewError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
export async function teacherInvoiceSendPreview(
 db:SupabaseClient,teacherId:string,invoiceId:string,includeRecipients=false
){
 const loaded=await loadInvoicePdf(db,{invoiceId,teacherId,requireDraft:true});
 if(!loaded.ok){
   const statuses:Record<string,number>={
     not_found:404,not_draft:409,no_items:409,no_family:409,pdf_failed:422,db_error:500,
   };
   const status=statuses[loaded.code]??500;
   throw new InvoiceSendPreviewError(status,loaded.code.toUpperCase(),
     "Invoice cannot be sent: "+loaded.code.replaceAll("_"," "));
 }
 const {invoice,family,policy,items}=loaded.data;
 const recipients=familyEmailRecipients(family);
 const {paidCents,balanceCents}=summarizePayments(invoice.subtotal_cents,
   (invoice.payments??[]).map(payment=>({amountCents:payment.amount_cents})));
 const locale=familyCommunicationLocale(family);
 const content=buildInvoiceEmailContent({
   locale,familyGreetingName:familyGreetingNames(family,locale),
   studioName:policy.studio_name,periodStart:invoice.period_start,
   periodEnd:invoice.period_end,currency:invoice.currency,
   subtotalCents:invoice.subtotal_cents,paidCents,balanceCents,
   paymentInstructions:policy.payment_instructions,
   paymentProvider:policy.payment_provider,
   hasPaymentQrCode:isValidPaymentQrDataUrl(policy.payment_qr_code),
   // Never mint, reveal or promise a Stripe link during a non-mutating preview.
   checkoutUrl:null,
 });
 return {
   invoiceId:invoice.id,invoiceRevision:invoice.updated_at,
   periodStart:invoice.period_start,periodEnd:invoice.period_end,
   currency:invoice.currency,subtotalCents:invoice.subtotal_cents,
   paidCents,balanceCents,
   itemCount:items.length,recipientCount:recipients.length,
   deliveryPossible:recipients.length>0,
   locale,
   messageSubject:content.subject,
   messagePreview:content.text,
   pdfReady:true,portalLinkIncluded:Boolean(family.portal_token),
   ...(includeRecipients?{recipients}:{}),
 };
}
