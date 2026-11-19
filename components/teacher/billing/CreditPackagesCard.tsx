"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useRef, useState } from "react";
import {useLocale,useTranslations} from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  centsToDollarsInput,
  dollarsToCents,
  formatMoney,
  resolveLessonCharge,
  type RateSources,
} from "@/lib/billing";
import {type CreditPackageState} from "@/lib/credits";
import {CreditAdjustmentPanel} from "@/components/teacher/billing/CreditAdjustmentPanel";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

export interface CreditPackageView {
  id: string;
  invoiceId: string;
  credits: number;
  durationMinutes: number;
  priceCents: number;
  startsOn: string;
  expiresOn: string | null;
  usedCredits: number;
  adjustmentCredits?: number;
  pendingCredits: number;
  remainingCredits: number;
  state: CreditPackageState;
  redemptions: { id: string; lessonDate: string | null }[];
}

const STATE_STYLES:Record<CreditPackageState,string>={
 pending:"bg-warning/20 text-foreground",active:"bg-success/15 text-success",
 used_up:"bg-surface-dim text-muted",expired:"bg-surface-dim text-muted",
};

/**
 * Prepaid lesson credits on the student page: balances, the lessons that used
 * them, and selling a new package (a draft invoice for the family).
 */
export function CreditPackagesCard({
  studentId,
  hasBillingAccount,
  workplaces,
  currency,
  packages,
  defaultDurationMinutes,
  rate,
  durationRates,
  rateBasis,
}: {
  studentId: string;
  hasBillingAccount: boolean;
  workplaces:{id:string;name:string}[];
  currency: string;
  packages: CreditPackageView[];
  defaultDurationMinutes: number;
  /** For the suggested price: what one lesson would bill at today. */
  rate: Omit<RateSources, "durationRateCents">;
  durationRates: Record<number, number>;
  rateBasis: "per_lesson" | "per_hour";
}) {
  const t=useTranslations("credits");
  const [selling, setSelling] = useState(false);
  const live = packages.filter((p) => p.state === "active");
  const totalLeft = live.reduce((sum, p) => sum + p.remainingCredits, 0);

  return (
    <Card padding="sm" className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="text-xs text-muted">
            {live.length > 0
              ? t("creditsLeft",{count:totalLeft})
              :t("description")}
          </p>
        </div>
        {!selling && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSelling(true)}
            disabled={!hasBillingAccount||workplaces.length===0}
            title={hasBillingAccount?undefined:t("assignBillingFirst")}
          >
            {t("sellPackage")}
          </Button>
        )}
      </div>

      {selling && (
        <SellPackageForm
          studentId={studentId}
          workplaces={workplaces}
          currency={currency}
          defaultDurationMinutes={defaultDurationMinutes}
          rate={rate}
          durationRates={durationRates}
          rateBasis={rateBasis}
          onCancel={() => setSelling(false)}
        />
      )}

      {packages.length > 0 && (
        <div className="space-y-2 mt-3">
          {packages.map((pkg) => (
            <PackageRow key={pkg.id} pkg={pkg} currency={currency} />
          ))}
        </div>
      )}
    </Card>
  );
}

function PackageRow({
  pkg,
  currency,
}: {
  pkg: CreditPackageView;
  currency: string;
}) {
  const t=useTranslations("credits"),locale=useLocale();
  const toUserError=useLocalizedApiError();
  const date=(d:string)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"}).format(new Date(d+"T12:00:00Z"));
  const router = useRouter();
  const confirm = useConfirm();
  const [showUsed, setShowUsed] = useState(false);
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiry, setExpiry] = useState(pkg.expiresOn ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badgeClass=STATE_STYLES[pkg.state];

  async function saveExpiry() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/billing/credit-packages/${pkg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresOn: expiry || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(toUserError(data,t("expirySaveError")));
      return;
    }
    setEditingExpiry(false);
    router.refresh();
  }

  async function returnCredit(redemptionId: string, lessonDate: string | null) {
    const ok = await confirm({
      title:t("returnTitle"),
      message:t("returnWarning",{date:lessonDate?date(lessonDate):""}),
      confirmLabel:t("returnCredit"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/billing/credit-redemptions/${redemptionId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(toUserError(data,t("returnError")));
      return;
    }
    router.refresh();
  }

  return (
    <div className="border border-border rounded-lg p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium flex flex-wrap items-center gap-2">
            {t("packageDescription",{count:pkg.credits,minutes:pkg.durationMinutes})}
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>
              {pkg.state==="pending"?t("pending"):pkg.state==="active"?t("active"):pkg.state==="used_up"?t("usedUp"):t("expired")}
            </span>
          </div>
          <div className="text-xs text-muted mt-0.5">
            {formatMoney(pkg.priceCents, currency)} · {t("from")}{" "}
            {date(pkg.startsOn)} ·{" "}
            {pkg.expiresOn
              ?t("expiresOn",{date:date(pkg.expiresOn)})
              :t("noExpiry")}{" "}
            ·{" "}
            <Link
              href={`/billing/${pkg.invoiceId}`}
              className="text-primary hover:underline"
            >
              {t("invoice")}
            </Link>
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="text-lg font-bold tabular-nums">
            {pkg.remainingCredits}
            <span className="text-sm font-normal text-muted">
              {" "}
              / {t("remainingTotal",{count:pkg.credits+(pkg.adjustmentCredits??0)})}
            </span>
          </div>
          {pkg.pendingCredits > 0 && (
            <div className="text-xs text-muted">
              {t("pendingCredits",{count:pkg.pendingCredits})}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
        {editingExpiry ? (
          <span className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={expiry}
              min={pkg.startsOn}
              onChange={(e) => setExpiry(e.target.value)}
              className={inputClass}
              aria-label={t("expiryDate")}
            />
            <Button size="sm" onClick={saveExpiry} disabled={busy}>
              {t("save")}
            </Button>
            <button
              type="button"
              onClick={() => {
                setExpiry(pkg.expiresOn ?? "");
                setEditingExpiry(false);
              }}
              className="text-muted hover:text-foreground cursor-pointer"
            >
              {t("cancel")}
            </button>
            <span className="text-muted">{t("expiryHint")}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setEditingExpiry(true)}
            className="text-primary hover:underline cursor-pointer"
          >
            {t("changeExpiry")}
          </button>
        )}
        {pkg.redemptions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowUsed((v) => !v)}
            className="text-primary hover:underline cursor-pointer"
          >
            {showUsed?t("hideUsed",{count:pkg.redemptions.length}):t("showUsed",{count:pkg.redemptions.length})}
          </button>
        )}
      </div>

      {showUsed && (
        <ul className="mt-2 space-y-1">
          {pkg.redemptions.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span>
                {r.lessonDate?date(r.lessonDate):t("lesson")}
              </span>
              <button
                type="button"
                onClick={() => returnCredit(r.id, r.lessonDate)}
                disabled={busy}
                className="text-error hover:underline cursor-pointer disabled:opacity-50"
              >
                {t("returnCredit")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreditAdjustmentPanel packageId={pkg.id} />
      {error && <p className="text-error text-xs mt-2">{error}</p>}
    </div>
  );
}

function SellPackageForm({
  studentId,
  workplaces,
  currency,
  defaultDurationMinutes,
  rate,
  durationRates,
  rateBasis,
  onCancel,
}: {
  studentId: string;
  workplaces:{id:string;name:string}[];
  currency: string;
  defaultDurationMinutes: number;
  rate: Omit<RateSources, "durationRateCents">;
  durationRates: Record<number, number>;
  rateBasis: "per_lesson" | "per_hour";
  onCancel: () => void;
}) {
  const t=useTranslations("credits");
  const toUserError=useLocalizedApiError();
  const router = useRouter();
  // Keep the same request ID for transport retries; server-side RPC returns
  // the original invoice instead of selling duplicate prepaid lessons.
  const requestId = useRef<string | null>(null);

  function suggestedPrice(credits: number, durationMinutes: number): string {
    const charge = resolveLessonCharge(
      { ...rate, durationRateCents: durationRates[durationMinutes] ?? null },
      durationMinutes,
      rateBasis
    );
    return charge.missingRate
      ? ""
      : centsToDollarsInput(charge.amountCents * credits);
  }

  const [workplaceId,setWorkplaceId]=useState(workplaces[0]?.id??"");
  const [credits, setCredits] = useState("10");
  const [duration, setDuration] = useState(String(defaultDurationMinutes));
  const [price, setPrice] = useState(
    suggestedPrice(10, defaultDurationMinutes)
  );
  const [priceEdited, setPriceEdited] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSuggestion(nextCredits: string, nextDuration: string) {
    if (priceEdited) return;
    const c = Number(nextCredits);
    const d = Number(nextDuration);
    if (Number.isInteger(c) && c > 0 && Number.isInteger(d) && d > 0) {
      setPrice(suggestedPrice(c, d));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = dollarsToCents(price);
    if (priceCents == null) {
      setError(t("priceRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/billing/credit-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        workplaceId,
        requestId: requestId.current ?? (requestId.current = crypto.randomUUID()),
        credits: Number(credits),
        durationMinutes: Number(duration),
        priceCents,
        expiresOn: expiresOn || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(toUserError(data,t("packageCreateFailed")));
      return;
    }
    router.push(`/billing/${data.invoiceId}`);
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg p-3 mt-2 space-y-3"
    >
      <label className="block text-sm">
        <span className="block text-xs font-semibold text-muted mb-1">{t("workplace")}</span>
        <select className={inputClass+" w-full"} required value={workplaceId}
          onChange={e=>{setWorkplaceId(e.target.value);requestId.current=null;}}>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("lessons")}
          </span>
          <input
            type="number"
            min={1}
            max={200}
            value={credits}
            onChange={(e) => {
              setCredits(e.target.value);
              updateSuggestion(e.target.value, duration);
            }}
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("length")}
          </span>
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => {
              setDuration(e.target.value);
              updateSuggestion(credits, e.target.value);
            }}
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("price",{currency})}
          </span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setPriceEdited(true);
            }}
            placeholder="0.00"
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("expiresOptional")}
          </span>
          <input
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className={`${inputClass} w-full`}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        {t("createHint",{duration:duration||"?"})}
      </p>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          {busy?t("creating"):t("createInvoice")}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
