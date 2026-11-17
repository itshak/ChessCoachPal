import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { loadInvoicePdf } from "@/lib/server/invoice-pdf-data";
import {familyCommunicationLocale} from "@/lib/server/communication-locales";
import { isValidPaymentQrDataUrl } from "@/lib/payment-qr";
import {buildInvoiceEmailContent} from "@/lib/server/invoice-email-content";
import { summarizePayments } from "@/lib/billing";
import { createCheckoutSession, expireCheckoutSession } from "@/lib/payments";
import {
  familyEmailRecipients,
  familyDisplayName,
  familyGreetingNames,
  familyEmailBcc,
  stripeCheckoutPrefillEmail,
} from "@/lib/guardians";

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
      case "no_family":
        return { ok: false, error: "Family not found" };
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

  const { invoice, family, policy, pdfBytes } = loaded.data;
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
  const familyName = familyDisplayName(family);

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
        studioName: policy.studio_name,
        periodLabel: `${invoice.period_start} – ${invoice.period_end}`,
        successUrl: `${origin}/portal/${family.portal_token}?paid=1`,
        cancelUrl: `${origin}/portal/${family.portal_token}`,
        customerEmail: stripeCheckoutPrefillEmail(family),
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

  const recipients = familyEmailRecipients(family);
  let emailed = false;
  let emailError: string | undefined;

  if (recipients.length === 0) {
    emailError =
      "No family email on file; invoice marked sent for the portal";
  } else {
    const locale=familyCommunicationLocale(family);
    const content=buildInvoiceEmailContent({
      locale,familyGreetingName:familyGreetingNames(family,locale),
      studioName:policy.studio_name,periodStart:invoice.period_start,
      periodEnd:invoice.period_end,currency:invoice.currency,
      subtotalCents:invoice.subtotal_cents,paidCents,balanceCents,
      paymentInstructions:policy.payment_instructions,
      paymentProvider:policy.payment_provider,
      hasPaymentQrCode:isValidPaymentQrDataUrl(policy.payment_qr_code),
      checkoutUrl,
    });

    const result = await sendEmail({
      to: recipients,
      bcc: familyEmailBcc(policy),
      subject: content.subject,
      text: content.text,
      html: content.html,
      locale,
      fromName: policy.studio_name
        ? `${policy.studio_name} (via ChessCoachPal)`
        : undefined,
      replyTo: teacherEmail ?? undefined,
      portalUrl: family.portal_token
        ? `${origin}/portal/${family.portal_token}`
        : undefined,
      attachments: [
        {
          filename: `invoice-${invoice.period_start}.pdf`,
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
    emailed = result.sent;
    emailError = result.error;
  }

  return { ok: true, emailed, emailError, checkoutUrl, checkoutError };
}
