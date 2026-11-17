"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useLocale,useTranslations} from "next-intl";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HostedPlanSummary } from "@/components/teacher/HostedLimitBanner";
import type { HostedPlan } from "@/lib/entitlements";

export function HostingSettingsForm({
  plan,
  softLimitsApply,
  trialEndsAt,
  giftedUntil,
  foundingNumber,
  monthlyPriceCents,
  checkoutConfigured,
  hasStripeCustomer,
  stripeCancelAt,
  usage,
}: {
  plan: HostedPlan;
  softLimitsApply: boolean;
  trialEndsAt: string | null;
  giftedUntil: string | null;
  foundingNumber: number | null;
  monthlyPriceCents: number;
  checkoutConfigured: boolean;
  hasStripeCustomer: boolean;
  stripeCancelAt: string | null;
  usage: {
    students: number;
    limits: {
      maxStudents: number;
    };
  };
}) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const t=useTranslations("hostingSettings"),locale=useLocale();
  const toUserError=useLocalizedApiError();
  const [message, setMessage] = useState<string | null>(null);

  const canUpgrade =
    softLimitsApply || plan === "trial" || plan === "free" || plan === "gifted";
  const canManageBilling =
    checkoutConfigured && hasStripeCustomer && (plan === "pro" || plan === "founding" || !!stripeCancelAt);

  async function startCheckout() {
    setBusy("checkout");
    setMessage(null);
    try {
      const res = await fetch("/api/hosted-billing/checkout", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(toUserError(data, t("checkoutError")));
        setBusy(null);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setMessage(t("checkoutUrlMissing"));
      setBusy(null);
    } catch {
      setMessage(t("checkoutError"));
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setMessage(null);
    try {
      const res = await fetch("/api/hosted-billing/portal", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(toUserError(data, t("portalError")));
        setBusy(null);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setMessage(t("portalUrlMissing"));
      setBusy(null);
    } catch {
      setMessage(t("portalError"));
      setBusy(null);
    }
  }

  return (
    <Card padding="sm">
      <h2 className="font-semibold mb-1">{t("title")}</h2>
      <p className="text-sm text-muted mb-3">
        {t("description")}
      </p>
      <HostedPlanSummary
        plan={plan}
        softLimitsApply={softLimitsApply}
        trialEndsAt={trialEndsAt}
        giftedUntil={giftedUntil}
        foundingNumber={foundingNumber}
        monthlyPriceCents={monthlyPriceCents}
        usage={usage}
      />
      {stripeCancelAt && plan === "pro" && (
        <p className="text-xs text-muted mt-2">
          {t("cancelsOn",{date:new Date(stripeCancelAt).toLocaleDateString(locale)})}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        {canUpgrade && checkoutConfigured && (
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || plan === "pro" || plan === "founding"}
            onClick={startCheckout}
          >
            {busy==="checkout"?"…":t("upgrade")}
          </Button>
        )}
        {canManageBilling && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={openPortal}
          >
            {busy==="portal"?"…":t("manage")}
          </Button>
        )}
        <Link href="/hosting">
          <Button type="button" size="sm" variant="secondary">
            {t("options")}
          </Button>
        </Link>
      </div>
      {message && <p className="text-sm text-error mt-2">{message}</p>}
    </Card>
  );
}
