"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useMemo, useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/billing";
import { InvoiceStatusBadge } from "@/components/teacher/billing/BillingList";

export interface InvoiceListRow {
  id: string;
  billingAccountName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  subtotalCents: number;
  /** Sum of recorded payments. */
  paidCents: number;
  currency: string;
}

/**
 * Billing list with multi-select for the monthly send workflow.
 * Bulk Send = drafts only; Delete = draft/void; Void = draft/sent (not paid).
 */
export function InvoiceList({ invoices }: { invoices: InvoiceListRow[] }) {
  const t=useTranslations("invoiceList");
  const toUserError=useLocalizedApiError();
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedRows = useMemo(
    () => invoices.filter((inv) => selected.has(inv.id)),
    [invoices, selected]
  );

  const allSelected =
    invoices.length > 0 && selected.size === invoices.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.id)));
  }

  async function runBulk(action: "send" | "delete" | "void") {
    const actionable =
      action === "send"
        ? selectedRows.filter((r) => r.status === "draft")
        : action === "delete"
          ? selectedRows.filter(
              (r) => r.status === "draft" || r.status === "void"
            )
          : selectedRows.filter(
              (r) => r.status === "draft" || r.status === "sent"
            );

    if (actionable.length === 0) return;

    const ids = actionable.map((r) => r.id);
    const n = ids.length;
    const skipped = selected.size - n;

    let previewDigest: string | undefined;
    let sendRecipients = "";
    if (action === "send") {
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch("/api/billing/invoices/bulk",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"preview",ids,includeRecipients:true}),
        });
        const body=await response.json();
        if(!response.ok||!body.ok){
          setMessage(t("notSendable"));
          return;
        }
        previewDigest=body.previewDigest;
        sendRecipients=body.results.map((item:{
          id:string;preview:{recipientCount:number;recipients:string[];
            subtotalCents:number;currency:string;};
        })=>{
          const invoice=actionable.find(row=>row.id===item.id);
          return (invoice?.billingAccountName??item.id)+": "+
            (item.preview.recipients.length?
              item.preview.recipients.join(", "):t("noEmail"))+
            " · "+formatMoney(item.preview.subtotalCents,item.preview.currency);
        }).join("\n");
      }catch{
        setMessage(t("recipientsFailed"));
        return;
      }finally{setBusy(false);}
    }

    const confirmMsg =
      action === "send"
        ?t("sendWarning",{count:n,recipients:sendRecipients,skipped:skipped>0?t("skippedNonDraft",{count:skipped}):""})
        : action === "delete"
          ?t("deleteWarning",{count:n,skipped:skipped>0?t("skippedSent",{count:skipped}):""})
          :t("voidWarning",{count:n,skipped:skipped>0?t("skippedPaid",{count:skipped}):""});

    const confirmed = await confirm({
      title:
        action === "send"
          ? t("sendTitle")
          : action === "delete"
            ? t("deleteTitle")
            :t("voidTitle"),
      message: confirmMsg,
      confirmLabel:
        action==="send"?t("send"):action==="delete"?t("delete"):t("void"),
      variant: action === "send" ? "primary" : "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/billing/invoices/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids,
        ...(action==="send"?{confirmedEmail:true,previewDigest}:{}) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    const labels = {send:t("send"),delete:t("delete"),void:t("void")};
    if (!res.ok) {
      setMessage(toUserError(data,t("actionFailed",{action:labels[action]})));
      return;
    }

    const failCount = data.failed?.length ?? 0;
    setMessage(
      failCount === 0
        ? t("allSucceeded",{action:labels[action],count:data.succeeded})
        : t("partialSuccess",{action:labels[action],count:data.succeeded,failed:failCount})
    );
    setSelected(new Set());
    router.refresh();
  }

  const draftSelected = selectedRows.filter((r) => r.status === "draft").length;
  const deletableSelected = selectedRows.filter(
    (r) => r.status === "draft" || r.status === "void"
  ).length;
  const voidableSelected = selectedRows.filter(
    (r) => r.status === "draft" || r.status === "sent"
  ).length;

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-border">
          <span className="text-sm text-muted me-1">
            {t("selected",{count:selected.size})}
          </span>
          <Button
            size="sm"
            onClick={() => runBulk("send")}
            disabled={busy || draftSelected === 0}
            title={t("sendOnlyDrafts")}
          >
            {t("sendDrafts",{count:draftSelected})}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => runBulk("void")}
            disabled={busy || voidableSelected === 0}
          >
            {t("voidSelected",{count:voidableSelected})}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => runBulk("delete")}
            disabled={busy || deletableSelected === 0}
            title={t("deleteOnlyDraftVoid")}
          >
            {t("deleteSelected",{count:deletableSelected})}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted hover:text-foreground cursor-pointer ms-auto"
          >
            {t("clear")}
          </button>
        </div>
      )}

      {message && <p className="text-sm text-muted mb-3">{message}</p>}

      <div className="flex items-center gap-3 py-2 px-1 border-b border-border text-xs text-muted">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label={t("selectAll")}
          className="cursor-pointer"
        />
        <span>{t("selectAll")}</span>
      </div>

      {invoices.map((inv) => {
        const checked = selected.has(inv.id);
        return (
          <div
            key={inv.id}
            className="flex items-center gap-3 py-3 px-1 border-b border-border last:border-0 hover:bg-surface-dim/50 transition-colors rounded"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(inv.id)}
              aria-label={t("selectFamily",{name:inv.billingAccountName})}
              className="cursor-pointer shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
            <Link
              href={`/billing/${inv.id}`}
              className="flex flex-1 items-center justify-between gap-3 min-w-0"
            >
              <div className="min-w-0">
                <div className="font-medium truncate"><bdi dir="auto">{inv.billingAccountName}</bdi></div>
                <div className="text-xs text-muted">
                  {inv.periodStart} → {inv.periodEnd}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <InvoiceStatusBadge
                  status={inv.status}
                  partiallyPaid={inv.paidCents > 0}
                />
                <span className="text-sm font-semibold tabular-nums text-end">
                  {formatMoney(inv.subtotalCents, inv.currency)}
                  {inv.status === "sent" &&
                    inv.paidCents > 0 &&
                    inv.paidCents < inv.subtotalCents && (
                      <span className="block text-xs font-normal text-muted">
                        {formatMoney(
                          inv.subtotalCents - inv.paidCents,
                          inv.currency
                        )}{" "}
                        {t("due")}
                      </span>
                    )}
                </span>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
