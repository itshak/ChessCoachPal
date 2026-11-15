import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { loadInvoicePdf } from "@/lib/server/invoice-pdf-data";
import { isValidPaymentQrDataUrl } from "@/lib/payment-qr";
import { formatMoney, summarizePayments } from "@/lib/billing";
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
            "Could not build the invoice PDF. Try removing emoji from names or notes.",
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
    const periodLabel = `${invoice.period_start} to ${invoice.period_end}`;
    const studio = policy.studio_name || "your studio";
    const total = formatMoney(invoice.subtotal_cents, invoice.currency);
    const paid = formatMoney(paidCents, invoice.currency);
    const balance = formatMoney(balanceCents, invoice.currency);
    const balanceSummary = paidCents > 0
      ? `Total: ${total}\nPaid: ${paid}\nBalance due: ${balance}`
      : `Total due: ${balance}`;
    const balanceHtml = paidCents > 0
      ? `<p>Total: ${escapeHtml(total)}<br/>Paid: ${escapeHtml(paid)}<br/><strong>Balance due: ${escapeHtml(balance)}</strong></p>`
      : `<p><strong>Total due: ${escapeHtml(balance)}</strong></p>`;
    const greeting = familyGreetingNames(family);

    const qrNote =
      balanceCents > 0 && !checkoutUrl &&
      policy.payment_provider === "manual" &&
      isValidPaymentQrDataUrl(policy.payment_qr_code)
        ? "A payment QR code is included on the attached invoice."
        : "";

    const payText = balanceCents === 0
      ? "Payment received in full. No further payment is due."
      : checkoutUrl
      ? `Pay online: ${checkoutUrl}`
      : policy.payment_instructions.trim()
        ? `Payment instructions:\n${policy.payment_instructions.trim()}${qrNote ? `\n\n${qrNote}` : ""}`
        : qrNote || "See your family portal for payment details.";

    const payHtml = balanceCents === 0
      ? "<p>Payment received in full. No further payment is due.</p>"
      : checkoutUrl
      ? `<p><a href="${escapeHtml(checkoutUrl)}">Pay online</a></p>`
      : policy.payment_instructions.trim()
        ? `<p><strong>Payment instructions</strong></p><p style="white-space:pre-wrap;">${escapeHtml(policy.payment_instructions.trim())}</p>${qrNote ? `<p>${qrNote}</p>` : ""}`
        : `<p>${qrNote || "See your family portal for payment details."}</p>`;

    const text = `Hi ${greeting},\n\nPlease find attached your invoice for ${periodLabel}.\n\n${balanceSummary}\n\n${payText}\n\n— ${studio} (sent via ChessCoachPal Studio)`;

    const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#222;">
<p>Hi ${escapeHtml(greeting)},</p>
<p>Please find attached your invoice for ${escapeHtml(periodLabel)}.</p>
${balanceHtml}
${payHtml}
<p>— ${escapeHtml(studio)} (sent via ChessCoachPal Studio)</p>
</div>`;

    const result = await sendEmail({
      to: recipients,
      bcc: familyEmailBcc(policy),
      subject: `Invoice for ${periodLabel} - ${studio}`,
      text,
      html,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
