"use client";

import { useRef, useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/billing";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

interface PreviewDraft {
  guardianId: string;
  familyName: string;
  subtotalCents: number;
  missingRateCount: number;
  creditedLessonCount: number;
  items: { description: string; amountCents: number; missingRate: boolean }[];
}

export function GenerateInvoicesModal({
  defaultStart,
  defaultEnd,
  currency,
  onClose,
}: {
  defaultStart: string;
  defaultEnd: string;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const t=useTranslations("billingList");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [busy, setBusy] = useState(false);
  // A retry of the same confirmed period must reuse its original receipt.
  const generationKey = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    drafts: PreviewDraft[];
    totalCents: number;
    skippedAlreadyInvoiced: number;
    creditsToUse: number;
  } | null>(null);

  async function runPreview() {
    if (periodEnd < periodStart) {
      setError(t("invalidDates"));
      return;
    }
    setBusy(true);
    setError(null);
    setPreview(null);
    generationKey.current=null;
    const res = await fetch("/api/billing/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, commit: false }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? t("previewFailed"));
      return;
    }
    setPreview({
      drafts: data.drafts,
      totalCents: data.totalCents,
      skippedAlreadyInvoiced: data.skippedAlreadyInvoiced ?? 0,
      creditsToUse: data.creditsToUse ?? 0,
    });
  }

  async function commit() {
    generationKey.current??=crypto.randomUUID();
    setBusy(true);
    setError(null);
    let res:Response;
    try{
      res = await fetch("/api/billing/generate", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({periodStart,periodEnd,commit:true,
          idempotencyKey:generationKey.current}),
      });
    }catch{
      setBusy(false);
      setError(t("connectionInterrupted"));
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? t("createFailed"));
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" padding="lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-sm cursor-pointer"
          >
            {t("close")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("from")}
            </span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => {setPeriodStart(e.target.value);setPreview(null);generationKey.current=null;}}
              className={`${inputClass} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("to")}
            </span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => {setPeriodEnd(e.target.value);setPreview(null);generationKey.current=null;}}
              className={`${inputClass} w-full`}
            />
          </label>
        </div>

        <div className="flex gap-2 mb-4">
          <Button size="sm" onClick={runPreview} disabled={busy}>
            {busy&&!preview?t("loading"):t("preview")}
          </Button>
        </div>

        {error && <p className="text-error text-sm mb-3">{error}</p>}

        {preview && (
          <div className="space-y-3 mb-4">
            {preview.skippedAlreadyInvoiced > 0 && (
              <p className="text-xs text-muted bg-surface-dim rounded-lg px-3 py-2">
                {t("alreadyInvoiced",{count:preview.skippedAlreadyInvoiced})}
              </p>
            )}
            {preview.creditsToUse > 0 && (
              <p className="text-xs text-muted bg-surface-dim rounded-lg px-3 py-2">
                {t("creditsUsed",{count:preview.creditsToUse})}
              </p>
            )}
            {preview.drafts.length === 0 && preview.creditsToUse > 0 ? (
              <>
                <p className="text-sm text-muted">
                  {t("nothingButCredits")}
                </p>
                <Button size="sm" onClick={commit} disabled={busy}>
                  {busy?t("saving"):t("useCredits")}
                </Button>
              </>
            ) : preview.drafts.length === 0 ? (
              <p className="text-sm text-muted">
                {preview.skippedAlreadyInvoiced > 0
                  ? t("nothingNew")
                  : t("noBillable")}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  {t("familiesAmount",{count:preview.drafts.length,amount:formatMoney(preview.totalCents,currency)})}
                </p>
                {preview.drafts.map((d) => (
                  <div
                    key={d.guardianId}
                    className="border border-border rounded-lg p-3 text-sm"
                  >
                    <div className="flex justify-between font-medium mb-1">
                      <span>{d.familyName}</span>
                      <span>{formatMoney(d.subtotalCents, currency)}</span>
                    </div>
                    {d.creditedLessonCount > 0 && (
                      <p className="text-xs text-muted mb-1">
                        {t("familyCredits",{count:d.creditedLessonCount})}
                      </p>
                    )}
                    {d.missingRateCount > 0 && (
                      <p className="text-xs text-error mb-1">
                        {t("missingRates",{count:d.missingRateCount})}
                      </p>
                    )}
                    <ul className="text-xs text-muted space-y-0.5">
                      {d.items.slice(0, 4).map((item, i) => (
                        <li key={i}>
                          {item.description}
                          {item.missingRate?t("noRate"):""}
                        </li>
                      ))}
                      {d.items.length > 4 && (
                        <li>{t("moreItems",{count:d.items.length-4})}</li>
                      )}
                    </ul>
                  </div>
                ))}
                <Button
                  size="sm"
                  onClick={commit}
                  disabled={busy || preview.drafts.length === 0}
                >
                  {busy?t("creating"):t("createDrafts")}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export function BillingListActions({
  defaultStart,
  defaultEnd,
  currency,
}: {
  defaultStart: string;
  defaultEnd: string;
  currency: string;
}) {
  const t=useTranslations("billingList");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>
          {t("title")}
        </Button>
        <a
          href="/api/billing/export"
          className="inline-flex items-center justify-center font-semibold bg-surface border border-border text-foreground hover:border-primary/50 px-3 py-1.5 text-sm rounded-lg transition-colors"
        >
          {t("exportCsv")}
        </a>
      </div>
      {open && (
        <GenerateInvoicesModal
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
          currency={currency}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function InvoiceStatusBadge({
  status,
  partiallyPaid = false,
}: {
  status: string;
  /** Sent invoice with some, but not all, of its total paid. */
  partiallyPaid?: boolean;
}) {
  const t=useTranslations("billingList");
  const styles: Record<string, string> = {
    draft: "bg-surface-dim text-muted",
    sent: "bg-primary/10 text-primary",
    partial: "bg-warning/25 text-foreground",
    paid: "bg-success/15 text-success",
    void: "bg-surface-dim text-error line-through",
  };
  const partial = partiallyPaid && status === "sent";
  const statusLabel = partial?t("partial"):status==="draft"?t("draft"):status==="sent"?t("sent"):status==="paid"?t("paid"):status==="void"?t("void"):status;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
        styles[partial ? "partial" : status] ?? styles.draft
      }`}
    >
      {statusLabel}
    </span>
  );
}

export function InvoiceRowLink({
  id,
  familyName,
  periodStart,
  periodEnd,
  status,
  subtotalCents,
  currency,
}: {
  id: string;
  familyName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotalCents: number;
  currency: string;
}) {
  return (
    <Link
      href={`/billing/${id}`}
      className="flex items-center justify-between gap-3 py-3 px-1 border-b border-border last:border-0 hover:bg-surface-dim/50 transition-colors rounded"
    >
      <div className="min-w-0">
        <div className="font-medium truncate"><bdi dir="auto">{familyName}</bdi></div>
        <div className="text-xs text-muted">
          {periodStart} → {periodEnd}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <InvoiceStatusBadge status={status} />
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(subtotalCents, currency)}
        </span>
      </div>
    </Link>
  );
}
