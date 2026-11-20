"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useRef, useState } from "react";
import {useLocale,useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  centsToDollarsInput,
  dollarsToCents,
  formatMoney,
  summarizePayments,
} from "@/lib/billing";
import { InvoiceStatusBadge } from "@/components/teacher/billing/BillingList";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

const amountInputClass =
  "w-[5.5rem] px-2 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm tabular-nums";

interface LineItem {
  id?: string;
  sessionId?: string | null;
  studentId?: string | null;
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
}

export function InvoiceDetailClient({
  invoiceId,
  status,
  sentAt,
  initialRevision,
  currency,
  initialItems,
  initialNotes,
  billingAccountName,
  periodStart,
  periodEnd,
  subtotalCents,
  paymentProvider,
  stripeConfigured,
  checkoutUrl,
  paymentInstructions,
  paymentQrCode,
  payments = [],
  creditPackage = null,
}: {
  invoiceId: string;
  status: string;
  sentAt: string | null;
  initialRevision: string;
  currency: string;
  initialItems: LineItem[];
  initialNotes: string;
  billingAccountName: string;
  periodStart: string;
  periodEnd: string;
  subtotalCents: number;
  paymentProvider: "manual" | "stripe";
  stripeConfigured: boolean;
  checkoutUrl: string | null;
  paymentInstructions: string;
  paymentQrCode: string | null;
  payments?: {
    id: string;
    amountCents: number;
    method: string;
    note: string;
    recordedAt: string;
  }[];
  /** Set when this invoice sells prepaid credits; its line is fixed. */
  creditPackage?: { studentId: string; studentName: string; label: string } | null;
}) {
  const router = useRouter();
  const t=useTranslations("invoiceDetail");
  const toUserError=useLocalizedApiError();
  const locale=useLocale();
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  // Keep the original revision/key across network retries; never treat a
  // second click as permission to overwrite a newer draft.
  const regenerationReceipt=useRef<{revision:string;key:string}|null>(null);
  const [flash, setFlash] = useState<{
    text: string;
    tone: "ok" | "error" | "warn";
  } | null>(null);
  const isDraft = status === "draft";
  const isPaidUnsent = status === "paid" && sentAt === null;
  const pendingManualPayment = useRef<{ fingerprint: string; key: string } | null>(null);
  const successfullySavedPaymentDraft = useRef<string | null>(null);
  const itemsEditable = isDraft && !creditPackage;
  const { paidCents, balanceCents } = summarizePayments(subtotalCents, payments);
  const partiallyPaid = (status === "sent" || status === "draft") && paidCents > 0 && balanceCents > 0;
  const liveBalanceCents = isDraft
    ? items.reduce((sum, item) => sum + item.amountCents, 0) - paidCents
    : balanceCents;
  const [paymentForm, setPaymentForm] = useState<{
    amount: string;
    note: string;
  } | null>(null);

  // Re-sync local edits when the server payload changes (router.refresh after
  // save/send) — the sanctioned adjust-state-during-render pattern.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (prevInitialItems !== initialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
    setNotes(initialNotes);
  }

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        if (patch.unitCents !== undefined || patch.quantity !== undefined) {
          next.amountCents = next.unitCents * next.quantity;
        }
        return next;
      })
    );
  }

  async function saveDraft() {
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/billing/invoices/${invoiceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, notes }),
    });
    setBusy(false);
    if (res.ok) {
      setFlash({ text:t("saved"), tone: "ok" });
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setFlash({ text: toUserError(data, t("saveFailed")), tone: "error" });
    }
  }

  async function regenerate() {
    const ok = await confirm({
      title:t("regenerateTitle"),
      message:
        t("regenerateWarning"),
      confirmLabel:t("regenerate"),
    });
    if (!ok) return;
    regenerationReceipt.current??={revision:initialRevision,key:crypto.randomUUID()};
    setBusy(true);
    setFlash(null);
    let res:Response;
    try{
      res=await fetch(`/api/billing/invoices/${invoiceId}/regenerate`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          expectedUpdatedAt:regenerationReceipt.current.revision,
          idempotencyKey:regenerationReceipt.current.key,
        }),
      });
    }catch{
      setBusy(false);
      setFlash({text:t("regenerateConnection"),tone:"error"});
      return;
    }
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if(res.status===409){regenerationReceipt.current=null;router.refresh();}
      setFlash({ text: toUserError(data, t("regenerateFailed")), tone: "error" });
      return;
    }
    regenerationReceipt.current=null;
    setFlash({
      text:
        data.itemCount === 0
          ? t("regeneratedEmpty")
          : t("regenerated",{count:data.itemCount}),
      tone: data.itemCount === 0 ? "warn" : "ok",
    });
    router.refresh();
  }

  async function send() {
    setBusy(true);
    setFlash(null);
    try {
      // A failed draft save must never fall through to an external email.
      if (isDraft) {
        const saved = await fetch("/api/billing/invoices/" + invoiceId, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, notes }),
        });
        if (!saved.ok) {
          const failure = await saved.json().catch(() => ({}));
          throw new Error(failure.error ?? t("saveBeforeSend"));
        }
      }
      const response = await fetch(
        "/api/billing/invoices/" + invoiceId + "/send?includeRecipients=true",
        { cache: "no-store" }
      );
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error ?? t("previewBeforeSend"));
      }
      const preview = await response.json() as {
        messageSubject: string; messagePreview: string; subtotalCents: number;
        currency: string; recipientCount: number; recipients?: string[];
        pdfReady: boolean;
      };
      if (!preview.pdfReady) throw new Error(t("pdfNotReady"));
      const recipients = preview.recipients?.length
        ? preview.recipients.join(", ")
        :t("noEmail");
      const approved = await confirm({
        title:t("sendTitle"),
        message: [
          t("previewAmount",{amount:formatMoney(preview.subtotalCents,preview.currency)}),
          t("previewRecipients",{count:preview.recipientCount,recipients}),
          t("previewSubject",{subject:preview.messageSubject}),
          "",
          preview.messagePreview,
          "",
          t("sendWarning"),
        ].join("\n"),
        confirmLabel:t("sendInvoice"),
      });
      if (!approved) return;
      const res = await fetch("/api/billing/invoices/" + invoiceId + "/send", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(toUserError(data, t("sendFailed")));
      const base = data.emailed
        ? t("sentEmailed")
        : data.emailError
          ? t("sentError",{error:data.emailError})
          : t("sent");
      const text = data.checkoutError ? base + ". " + data.checkoutError : base;
      setFlash({
        text,
        tone: data.emailError || data.checkoutError ? "warn" : "ok",
      });
      router.refresh();
    } catch (error) {
      setFlash({
        text: toUserError(error, t("sendFailed")),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  // Both partial and full payments must apply to the teacher's SAVED total.
  // A failed draft edit must never record money against older line items.
  async function saveBeforePayment(): Promise<boolean> {
    const fingerprint = JSON.stringify({ items, notes });
    if (successfullySavedPaymentDraft.current === fingerprint) return true;
    if (!isDraft || (
      JSON.stringify(items) === JSON.stringify(initialItems) &&
      notes === initialNotes
    )) return true;
    const saved = await fetch(`/api/billing/invoices/${invoiceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items, notes, expectedUpdatedAt: initialRevision,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (!saved.ok) {
      const failure = await saved.json().catch(() => ({}));
      setFlash({ text: failure.error ?? t("saveBeforePayment"), tone: "error" });
      router.refresh();
      return false;
    }
    successfullySavedPaymentDraft.current = fingerprint;
    return true;
  }

  async function markPaid() {
    const approved = await confirm({
      title:t("fullPaymentTitle"),
      message:t("fullPaymentWarning",{amount:formatMoney(liveBalanceCents,currency)}),
      confirmLabel:t("recordFull"),
    });
    if (!approved) return;
    setBusy(true);
    setFlash(null);
    try {
      if (!await saveBeforePayment()) return;
      const res = await fetch(`/api/billing/invoices/${invoiceId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFlash({ text: toUserError(data, t("paymentNotRecorded")), tone: "error" });
      } else {
        setFlash({ text:t("paymentFull"), tone: "ok" });
        router.refresh();
      }
    } catch {
      setFlash({ text:t("paymentRequestFailed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment() {
    if (!paymentForm) return;
    const amountCents = dollarsToCents(paymentForm.amount);
    if (amountCents === null || amountCents <= 0) {
      setFlash({ text:t("positiveAmount"), tone: "error" });
      return;
    }
    if (amountCents > liveBalanceCents) {
      setFlash({
        text:t("overpayment",{amount:formatMoney(liveBalanceCents,currency)}),
        tone: "error",
      });
      return;
    }
    const fingerprint = JSON.stringify({ invoiceId, amountCents,
      note: paymentForm.note, items, notes });
    if (pendingManualPayment.current?.fingerprint !== fingerprint) {
      pendingManualPayment.current = { fingerprint, key: crypto.randomUUID() };
    }
    const requestKey = pendingManualPayment.current.key;
    setBusy(true);
    setFlash(null);
    try {
      if (!await saveBeforePayment()) return;
      const res = await fetch(`/api/billing/invoices/${invoiceId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, note: paymentForm.note,
          idempotencyKey: requestKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash({ text: toUserError(data, t("paymentNotRecorded")), tone: "error" });
        return;
      }
      pendingManualPayment.current = null;
      setPaymentForm(null);
      setFlash({
        text: data.paid
          ? t("paymentFull")
          : t("paymentPartial",{amount:formatMoney(data.balanceCents??0,currency)}),
        tone: "ok",
      });
      router.refresh();
    } catch {
      setFlash({
        text:t("paymentUnconfirmed"),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(payment: { id: string; amountCents: number }) {
    const reopens = status === "paid";
    const ok = await confirm({
      title:t("removePaymentTitle"),
      message:t("removePaymentWarning",{amount:formatMoney(payment.amountCents,currency),reopens:reopens?(sentAt?t("reopenSent"):t("reopenDraft")):""}),
      confirmLabel:t("removePayment"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setFlash(null);
    const res = await fetch(
      `/api/billing/invoices/${invoiceId}/payments/${payment.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setFlash({ text: toUserError(data, t("failed")), tone: "error" });
      return;
    }
    setFlash({
      text:
        reopens && data.status === "sent"
          ? t("removedReopened")
          : t("removed"),
      tone: "ok",
    });
    router.refresh();
  }

  async function voidInvoice() {
    const ok = await confirm({
      title:t("voidTitle"),
      message:
        paidCents > 0
          ? t("voidPaidWarning")
          : t("voidUnpaidWarning"),
      confirmLabel:t("void"),
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/billing/invoices/${invoiceId}/void`, {
      method: "POST",
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else {
      const data = await res.json().catch(() => ({}));
      setFlash({ text: toUserError(data, t("failed")), tone: "error" });
    }
  }

  async function createCheckout() {
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/billing/invoices/${invoiceId}/checkout`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setFlash({ text: toUserError(data, t("checkoutFailed")), tone: "error" });
      return;
    }
    if (data.url) {
      await navigator.clipboard.writeText(data.url).catch(() => {});
      setFlash({ text:t("copiedPayLink"), tone: "ok" });
      router.refresh();
    }
  }

  const liveTotal = items.reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold"><bdi dir="auto">{billingAccountName}</bdi></h1>
            <InvoiceStatusBadge status={status} partiallyPaid={partiallyPaid} />
          </div>
          <p className="text-sm text-muted">
            {periodStart} → {periodEnd} ·{" "}
            {formatMoney(isDraft ? liveTotal : subtotalCents, currency)}
            {partiallyPaid && (
              <>
                {" "}
                · {t("paidAmount",{amount:formatMoney(paidCents,currency)})} ·{" "}
                <span className="font-semibold text-foreground">
                  {t("dueAmount",{amount:formatMoney(balanceCents,currency)})}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              {!creditPackage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={regenerate}
                  disabled={busy}
                >
                  {t("regenerate")}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={saveDraft}
                disabled={busy}
              >
                {t("saveDraft")}
              </Button>
              <Button size="sm" onClick={send} disabled={busy}>
                {t("send")}
              </Button>
            </>
          )}
          {isPaidUnsent && (
            <Button size="sm" onClick={send} disabled={busy}>
              {t("sendPaid")}
            </Button>
          )}
          {status === "draft" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={markPaid}
              disabled={busy}
            >
              {t("markPaid")}
            </Button>
          )}
          {(status === "sent" || status === "draft") && liveBalanceCents > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPaymentForm({
                  amount: centsToDollarsInput(liveBalanceCents),
                  note: "",
                })
              }
              disabled={busy || paymentForm !== null}
            >
              {t("recordPayment")}
            </Button>
          )}
          {initialItems.length > 0 && (
            <a
              href={`/api/billing/invoices/${invoiceId}/pdf`}
              className="inline-flex items-center justify-center font-semibold bg-surface text-foreground border border-border hover:bg-surface-dim px-3 py-1.5 text-sm rounded-lg transition-colors"
            >
              {t("downloadPdf")}
            </a>
          )}
          {status === "sent" &&
            paymentProvider === "stripe" &&
            stripeConfigured && (
              <Button size="sm" onClick={createCheckout} disabled={busy}>
                {checkoutUrl?t("copyLink"):t("createLink")}
              </Button>
            )}
          {status !== "paid" && status !== "void" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={voidInvoice}
              disabled={busy}
            >
              {t("void")}
            </Button>
          )}
        </div>
      </div>

      {flash && (
        <p
          className={`text-sm font-medium ${
            flash.tone === "error"
              ? "text-error"
              : flash.tone === "warn"
                ? "text-warning"
                : "text-muted"
          }`}
          role={flash.tone === "error" ? "alert" : undefined}
        >
          {flash.text}
        </p>
      )}

      {paymentForm && (
        <Card padding="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              recordPayment();
            }}
            className="space-y-3"
          >
            <div>
              <h2 className="font-semibold">{t("recordPayment")}</h2>
              <p className="text-xs text-muted">
                {t("partialHint",{amount:formatMoney(liveBalanceCents,currency)})}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">{t("amount")}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted">$</span>
                  <input
                    value={paymentForm.amount}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, amount: e.target.value })
                    }
                    inputMode="decimal"
                    className={amountInputClass}
                    aria-label={t("paymentAmount")}
                    autoFocus
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-[10rem]">
                <span className="text-xs font-semibold text-muted">
                  {t("optionalNote")}
                </span>
                <input
                  value={paymentForm.note}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, note: e.target.value })
                  }
                  maxLength={500}
                  placeholder={t("notePlaceholder")}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={busy}>
                {t("savePayment")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => setPaymentForm(null)}
                disabled={busy}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {checkoutUrl && status === "sent" && (
        <Card padding="sm">
          <div className="text-xs font-semibold text-muted mb-1">
            {t("stripeLink")}
          </div>
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary font-medium hover:underline"
          >
            {t("payOnline")}
          </a>
        </Card>
      )}

      {creditPackage && (
        <Card padding="sm">
          <p className="text-sm text-muted">
            {t("creditPackageFor",{label:creditPackage.label})}{" "}
            <Link
              href={`/students/${creditPackage.studentId}`}
              className="text-primary hover:underline"
            >
              {creditPackage.studentName}
            </Link>
            .{" "}
            {isDraft
              ? t("creditPending")
              : status === "void"
                ? t("creditVoid")
                : t("creditApplied")}
          </p>
        </Card>
      )}

      <Card padding="sm">
        <h2 className="font-semibold mb-3">{t("lineItems")}</h2>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id ?? index}
              className="flex flex-col gap-2 sm:flex-row sm:items-center border-b border-border last:border-0 pb-3 last:pb-0"
            >
              {itemsEditable ? (
                <>
                  <input
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, { description: e.target.value })
                    }
                    className={`${inputClass} w-full sm:flex-1 sm:min-w-0`}
                  />
                  <div className="flex items-center gap-4 shrink-0 self-end sm:self-auto">
                    <label className="flex items-center gap-1.5">
                      <span className="text-sm text-muted">$</span>
                      <input
                        value={centsToDollarsInput(item.unitCents)}
                        onChange={(e) => {
                          const cents = dollarsToCents(e.target.value);
                          if (cents !== null) {
                            updateItem(index, { unitCents: cents });
                          }
                        }}
                        className={amountInputClass}
                        aria-label={t("lineAmount")}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="text-sm text-error hover:underline cursor-pointer px-1"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm flex-1 min-w-0">{item.description}</div>
                  <div className="text-sm font-medium tabular-nums shrink-0">
                    {formatMoney(item.amountCents, currency)}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        {itemsEditable && (
          <button
            type="button"
            onClick={() =>
              setItems((prev) => [
                ...prev,
                {
                  description:t("customLine"),
                  quantity: 1,
                  unitCents: 0,
                  amountCents: 0,
                },
              ])
            }
            className="mt-3 text-sm text-primary hover:underline cursor-pointer"
          >
            {t("addLine")}
          </button>
        )}
        <div className="mt-4 pt-3 border-t border-border flex justify-between font-semibold">
          <span>{t("total")}</span>
          <span>
            {formatMoney(isDraft ? liveTotal : subtotalCents, currency)}
          </span>
        </div>
      </Card>

      <Card padding="sm">
        <h2 className="font-semibold mb-2">{t("notes")}</h2>
        {isDraft ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputClass} w-full resize-y`}
            placeholder={t("invoiceNotePlaceholder")}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap text-muted">
            {notes || "-"}
          </p>
        )}
      </Card>

      {payments.length > 0 && (
        <Card padding="sm">
          <h2 className="font-semibold mb-2">{t("payments")}</h2>
          <ul className="space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <div>
                  <span className="font-medium capitalize">{p.method==="manual"?t("manual"):p.method==="stripe"?t("stripe"):p.method}</span>
                  {p.note ? (
                    <span className="text-muted"> · {p.note}</span>
                  ) : null}
                  <div className="text-xs text-muted">
                    {new Date(p.recordedAt).toLocaleString(locale)}
                  </div>
                </div>
                <span className="flex items-baseline gap-3">
                  {p.method === "manual" && status !== "void" && (
                    <button
                      type="button"
                      onClick={() => removePayment(p)}
                      disabled={busy}
                      className="text-xs text-error hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {t("remove")}
                    </button>
                  )}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(p.amountCents, currency)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {payments.length > 1 && (
            <div className="mt-3 pt-2 border-t border-border flex justify-between text-sm font-semibold">
              <span>{t("totalPaid")}</span>
              <span className="tabular-nums">
                {formatMoney(paidCents, currency)}
              </span>
            </div>
          )}
        </Card>
      )}

      {paymentProvider === "manual" && (paymentInstructions || paymentQrCode) && (
        <Card padding="sm">
          <h2 className="font-semibold mb-2">{t("instructions")}</h2>
          {paymentInstructions && (
            <p className="text-sm whitespace-pre-wrap text-muted">
              {paymentInstructions}
            </p>
          )}
          {paymentQrCode && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={paymentQrCode}
              alt={t("qrAlt")}
              className="mt-3 h-36 w-36 rounded-lg border border-border bg-white object-contain p-1"
            />
          )}
        </Card>
      )}
    </div>
  );
}
