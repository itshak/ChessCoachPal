import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy } from "@/lib/server/scheduling";
import { buildInvoicePdf } from "@/lib/server/invoice-pdf";
import { oneToOne } from "@/lib/schedule";
import {isAppLocale} from "@/i18n/locales";
import type {InvoiceBillingContact} from "@/lib/server/invoice-contact-authorization";

/**
 * Shared invoice -> PDF assembly. The send path (email attachment) and the
 * download route both need the same invoice/guardian/line-item/policy query,
 * so they live here to keep a sent invoice retrievable and the two PDFs
 * identical.
 */

type TeacherPolicy = Awaited<ReturnType<typeof getPolicy>>;

export interface InvoicePdfItemRow {
  description: string;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
  sort_order: number;
}

export interface InvoicePdfInvoiceRow {
  id: string;
  status: string;
  updated_at: string;
  currency: string;
  period_start: string;
  period_end: string;
  subtotal_cents: number;
  notes: string | null;
  stripe_checkout_url: string | null;
  stripe_checkout_session_id: string | null;
  sent_at: string | null;
  billing_accounts: InvoiceBillingContact | InvoiceBillingContact[] | null;
  invoice_items: InvoicePdfItemRow[] | null;
  payments: { amount_cents: number }[] | null;
}

export interface InvoicePdfBundle {
  invoice: InvoicePdfInvoiceRow;
  billingAccount: InvoiceBillingContact;
  policy: TeacherPolicy;
  items: InvoicePdfItemRow[];
  pdfBytes: Uint8Array;
  filename: string;
}

export type LoadInvoicePdfErrorCode =
  | "not_found"
  | "not_draft"
  | "no_items"
  | "no_billing_account"
  | "pdf_failed"
  | "db_error";

/** Codes a non-draft-gated caller (e.g. the download route) can receive. */
export type DownloadableInvoicePdfErrorCode = Exclude<
  LoadInvoicePdfErrorCode,
  "not_draft"
>;

export interface LoadInvoicePdfOk {
  ok: true;
  data: InvoicePdfBundle;
}

export type LoadInvoicePdfFailure<
  C extends LoadInvoicePdfErrorCode = LoadInvoicePdfErrorCode,
> = { ok: false; code: C };

export type LoadInvoicePdfResult = LoadInvoicePdfOk | LoadInvoicePdfFailure;

export interface LoadInvoicePdfOptions {
  invoiceId: string;
  teacherId: string;
  requireDraft?: boolean;
}

/**
 * Load an invoice (scoped to its teacher) and build its PDF in memory. Not
 * status-gated by default, so sent/paid invoices stay downloadable; pass
 * `requireDraft` for the send path.
 */
export function loadInvoicePdf(
  supabase: SupabaseClient,
  opts: LoadInvoicePdfOptions & { requireDraft: true }
): Promise<LoadInvoicePdfOk | LoadInvoicePdfFailure>;
export function loadInvoicePdf(
  supabase: SupabaseClient,
  opts: LoadInvoicePdfOptions & { requireDraft?: false }
): Promise<LoadInvoicePdfOk | LoadInvoicePdfFailure<DownloadableInvoicePdfErrorCode>>;
export async function loadInvoicePdf(
  supabase: SupabaseClient,
  opts: LoadInvoicePdfOptions
): Promise<LoadInvoicePdfResult> {
  const { invoiceId, teacherId, requireDraft = false } = opts;

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      *,
      billing_accounts (
        id, display_name, account_kind, contact_id,
        contacts ( id, display_name, email, preferred_locale, status )
      ),
      invoice_items ( * ),
      payments ( amount_cents )
    `
    )
    .eq("id", invoiceId)
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    console.error("loadInvoicePdf query failed:", error.message);
    return { ok: false, code: "db_error" };
  }

  const invoice = data as unknown as InvoicePdfInvoiceRow | null;
  if (!invoice) return { ok: false, code: "not_found" };
  // Already-paid but never-sent invoices must still be explicitly deliverable.
  if (requireDraft && !(invoice.status === "draft" ||
    (invoice.status === "paid" && invoice.sent_at === null))) {
    return { ok: false, code: "not_draft" };
  }

  const items = (invoice.invoice_items ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);

  if (items.length === 0) return { ok: false, code: "no_items" };

  const policy = await getPolicy(supabase, teacherId);
  const billingAccount = oneToOne(invoice.billing_accounts);
  if (!billingAccount) return {ok:false,code:"no_billing_account"};

  const alreadyPaidCents = (invoice.payments ?? [])
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildInvoicePdf({
      locale: isAppLocale(oneToOne(billingAccount.contacts)?.preferred_locale)
        ? oneToOne(billingAccount.contacts)!.preferred_locale as "en"|"he"|"ru"
        : "en",
      businessName: policy.business_name,
      familyName: billingAccount.display_name,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      currency: invoice.currency,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitCents: i.unit_cents,
        amountCents: i.amount_cents,
      })),
      subtotalCents: invoice.subtotal_cents,
      paidCents: alreadyPaidCents,
      paymentInstructions: policy.payment_instructions,
      paymentQrCode:
        policy.payment_provider === "manual" &&
        alreadyPaidCents < invoice.subtotal_cents ? policy.payment_qr_code : null,
      notes: invoice.notes ?? undefined,
    });
  } catch (err) {
    console.error(
      "Invoice PDF build failed:",
      err instanceof Error ? err.message : err
    );
    return { ok: false, code: "pdf_failed" };
  }

  return {
    ok: true,
    data: {
      invoice,
      billingAccount,
      policy,
      items,
      pdfBytes,
      filename: `invoice-${invoice.period_start}.pdf`,
    },
  };
}
