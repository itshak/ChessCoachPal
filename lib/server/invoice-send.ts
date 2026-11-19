import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { loadInvoicePdf } from "@/lib/server/invoice-pdf-data";
import {approvedInvoiceRecipient} from "@/lib/server/invoice-contact-authorization";
import { isValidPaymentQrDataUrl } from "@/lib/payment-qr";
import {buildInvoiceEmailContent} from "@/lib/server/invoice-email-content";
import { summarizePayments } from "@/lib/billing";
import { createCheckoutSession, expireCheckoutSession } from "@/lib/payments";


export interface SendInvoiceResult {
  ok: boolean;
  error?: string;
  emailed?: boolean;
  emailError?: string;
  checkoutUrl?: string | null;
  /** Set when Stripe Checkout was attempted but failed; send still succeeds. */
  checkoutError?: string;
}

/**
 * Send a saved draft or never-sent paid invoice PDF.
 * Shared by single-send and bulk; a settled invoice remains paid.
 */
export async function sendInvoice(
  supabase: SupabaseClient,
  opts: {
    invoiceId: string;
    teacherId: string;
    teacherEmail?: string | null;
    origin: string;
  }
): Promise<SendInvoiceResult> {
  const { invoiceId: id, teacherId, teacherEmail, origin } = opts;

  const loaded = await loadInvoicePdf(supabase, {
    invoiceId: id,
    teacherId,
    requireDraft: true,
  });

  if (!loaded.ok) {
    switch (loaded.code) {
      case "not_found":
        return { ok: false, error: "Not found" };
      case "not_draft":
        return { ok: false, error: "Only unsent drafts or never-sent paid invoices can be sent" };
      case "no_items":
        return { ok: false, error: "Add at least one line item before sending" };
      case "no_billing_account":
        return { ok: false, error: "Billing account not found" };
      case "pdf_failed":
        return {
          ok: false,
          error:
            "Could not build the invoice PDF; check the font resources and invoice content.",
        };
      case "db_error":
        return { ok: false, error: "Could not load the invoice" };
    }
  }

  const {invoice,billingAccount,policy,pdfBytes}=loaded.data;
  let recipient:Awaited<ReturnType<typeof approvedInvoiceRecipient>>;
  try{
    recipient=await approvedInvoiceRecipient(supabase,teacherId,id,billingAccount);
  }catch{
    return {ok:false,error:"Unable to verify invoice recipient permissions"};
  }
  if(!recipient)return {ok:false,
    error:"No approved contact is permitted to receive every line of this invoice; review student contact messaging permissions"};
  const {paidCents,balanceCents} = summarizePayments(invoice.subtotal_cents,
    (invoice.payments ?? []).map(payment => ({amountCents:payment.amount_cents})));
  // One request must claim this draft BEFORE creating any Stripe checkout
  // or delivering any email. A losing concurrent website/MCP/bulk caller is
  // rejected rather than replaying external side effects on an already-sent
  // invoice. In particular, PostgREST update errors alone do not indicate
  // whether any row matched the original draft status.
  const {data:claimed,error:claimError}=await supabase.rpc(
    "ccp_invoice_send_claim",{
      p_invoice_id:id,p_expected_updated_at:invoice.updated_at,
      p_expected_paid_cents:paidCents,
    });
  if(claimError||!claimed)return {ok:false,
    error:"Invoice or payment balance changed before sending; refresh the draft and retry"};
  const familyName = billingAccount.display_name;

  let checkoutUrl: string | null = invoice.stripe_checkout_url;
  let checkoutError: string | undefined;

  if (
    policy.payment_provider === "stripe" &&
    policy.stripe_secret_key &&
    balanceCents > 0 &&
    !checkoutUrl
  ) {
    try {
      const session = await createCheckoutSession({
        secretKey: policy.stripe_secret_key,
        invoiceId: id,
        teacherId,
        amountCents: balanceCents,
        currency: invoice.currency,
        familyName,
        businessName: policy.business_name,
        periodLabel: `${invoice.period_start} – ${invoice.period_end}`,
        // Payment never grants a contact access to private lesson information.
        successUrl: origin+"/?payment=completed",
        cancelUrl: origin+"/?payment=cancelled",
        customerEmail: recipient.email,
      });
      // Claim exactly the unchanged outstanding balance. This serializes
      // against fresh payments and editing even after the send claim.
      const {data:link,error:linkError}=await supabase.rpc("ccp_invoice_checkout_claim",{
        p_invoice_id:id,p_session_id:session.sessionId,
        p_checkout_url:session.url,p_expected_balance:balanceCents,
        p_expected_updated_at:claimed.updatedAt,
      });
      if(linkError || !link) {
        try { await expireCheckoutSession(policy.stripe_secret_key,session.sessionId); }
        catch { throw new Error("STRIPE_CHECKOUT_RECONCILIATION_REQUIRED"); }
        throw new Error("INVOICE_CHANGED_AFTER_SEND");
      }
      checkoutUrl = session.url;
    } catch (err) {
      console.error(
        "Stripe checkout on send failed:",
        err instanceof Error ? err.message : err
      );
      checkoutError =
        "Pay link could not be created. Use Create pay link to try again";
    }
  }

  const locale=recipient.locale;
  const content=buildInvoiceEmailContent({
    locale,familyGreetingName:recipient.displayName,
    businessName:policy.business_name,periodStart:invoice.period_start,
    periodEnd:invoice.period_end,currency:invoice.currency,
    subtotalCents:invoice.subtotal_cents,paidCents,balanceCents,
    paymentInstructions:policy.payment_instructions,
    paymentProvider:policy.payment_provider,
    hasPaymentQrCode:isValidPaymentQrDataUrl(policy.payment_qr_code),
    checkoutUrl,
  });
  const bcc=policy.bcc_contact_emails&&policy.bcc_email?.trim()
    ? policy.bcc_email.trim():undefined;
  const result=await sendEmail({
    to:[recipient.email],bcc,
    subject:content.subject,text:content.text,html:content.html,
    locale,fromName:policy.business_name
      ? policy.business_name+" (via ChessCoachPal)":undefined,
    replyTo:teacherEmail??undefined,
    // No portal credential is automatically minted or sent.
    attachments:[{filename:"invoice-"+invoice.period_start+".pdf",
      content:pdfBytes,contentType:"application/pdf"}],
  });
  const emailed=result.sent;
  const emailError=result.error;

  return { ok: true, emailed, emailError, checkoutUrl, checkoutError };
}
