"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TeacherPolicy } from "@/lib/schedule";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

/**
 * Studio policies are per-teacher settings, not hardcoded rules.
 * These options drive make-up credit derivation and billing billability.
 * Timezone is edited in Account settings; shown here as a read-only reminder.
 */
export function PolicySettings({
  policy,
  defaultOpen = false,
}: {
  policy: TeacherPolicy;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const t=useTranslations("scheduling");
  const toUserError=useLocalizedApiError();
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [windowHours, setWindowHours] = useState(policy.cancellation_window_hours);
  const [timelyEarns, setTimelyEarns] = useState(policy.timely_cancel_earns_makeup);
  const [lateEarns, setLateEarns] = useState(policy.late_cancel_earns_makeup);
  const [noShowEarns, setNoShowEarns] = useState(policy.no_show_earns_makeup);
  const [teacherEarns, setTeacherEarns] = useState(policy.teacher_cancel_earns_makeup);
  const [expiryDays, setExpiryDays] = useState<string>(
    policy.makeup_credit_expiry_days?.toString() ?? ""
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cancellationWindowHours: windowHours,
        timelyCancelEarnsMakeup: timelyEarns,
        lateCancelEarnsMakeup: lateEarns,
        noShowEarnsMakeup: noShowEarns,
        teacherCancelEarnsMakeup: teacherEarns,
        makeupCreditExpiryDays: expiryDays ? Number(expiryDays) : null,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage(t("saved"));
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(toUserError(data, t("failed")));
    }
    setTimeout(() => setMessage(null), 2500);
  }

  return (
    <Card padding="sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between cursor-pointer"
      >
        <h2 className="font-semibold">{t("policyTitle")}</h2>
        <span className="text-muted text-sm">{open ? "▴" : "▾"}</span>
      </button>
      {!open && (
        <p className="text-xs text-muted mt-1">
          {t("policySummary",{hours:windowHours})}
        </p>
      )}

      {open && (
        <form onSubmit={handleSave} className="flex flex-col gap-3 mt-3">
          <div className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("studioTimezone")}
            </span>
            <p className="px-3 py-2 rounded-lg border border-border bg-surface-dim text-muted text-sm">
              {policy.timezone}
            </p>
            <p className="text-xs text-muted mt-1">
              {t("timezoneHint")}{" "}
              <Link href="/account" className="text-primary hover:underline">
                {t("accountSettings")}
              </Link>
              .
            </p>
          </div>

          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("cancelNotice")}
            </span>
            <input
              type="number"
              min={0}
              max={168}
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className={`${inputClass} w-full`}
            />
            <span className="block text-xs text-muted mt-1">
              {t("lateHint")}
            </span>
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-muted mb-1">
              {t("makeupEarning")}
            </legend>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={timelyEarns}
                  onChange={(e) => setTimelyEarns(e.target.checked)}
                />
                {t("timely")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lateEarns}
                  onChange={(e) => setLateEarns(e.target.checked)}
                />
                {t("late")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noShowEarns}
                  onChange={(e) => setNoShowEarns(e.target.checked)}
                />
                {t("noShow")}
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={teacherEarns}
                  onChange={(e) => setTeacherEarns(e.target.checked)}
                />
                {t("teacherCancel")}
              </label>
            </div>
          </fieldset>

          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("expiryDays")}
            </span>
            <input
              type="number"
              min={1}
              placeholder={t("never")}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className={`${inputClass} w-full`}
            />
            <span className="block text-xs text-muted mt-1">
              {t("expiryHint")}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("saving") : t("savePolicy")}
            </Button>
            {message && <span className="text-xs text-muted">{message}</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
