"use client";

import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {
  formatHostedPrice,
  type HostedPlan,
} from "@/lib/entitlements";

export function HostedLimitBanner({
  message,
  monthlyPriceCents,
}: {
  message?: string | null;
  monthlyPriceCents: number;
}) {
  const price = formatHostedPrice(monthlyPriceCents);
  const t=useTranslations("hosted"),locale=useLocale();
  return (
    <div
      role="status"
      className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-4"
    >
      <p>
        {message ??
          t("limit",{price})}{" "}
        <Link href="/hosting" className="font-semibold text-primary underline">
          {t("options")}
        </Link>
      </p>
    </div>
  );
}

export function HostedPlanSummary({
  plan,
  softLimitsApply,
  trialEndsAt,
  giftedUntil,
  foundingNumber,
  monthlyPriceCents,
  usage,
}: {
  plan: HostedPlan;
  softLimitsApply: boolean;
  trialEndsAt: string | null;
  giftedUntil: string | null;
  foundingNumber: number | null;
  monthlyPriceCents: number;
  usage: {
    students: number;
    limits: {
      maxStudents: number;
    };
  };
}) {
  const price = formatHostedPrice(monthlyPriceCents);
  const t=useTranslations("hosted"),locale=useLocale();
  return (
    <div className="text-sm space-y-2">
      <p>
        <span className="font-medium">{t("plan")}</span> {t(plan==="free"?"plans.free":plan==="trial"?"plans.trial":plan==="pro"?"plans.pro":plan==="founding"?"plans.founding":"plans.gifted")}
        {plan === "founding" && foundingNumber != null
          ? ` (#${foundingNumber})`
          : ""}
        {softLimitsApply
          ? t("limited")
          : t("unlimited")}
      </p>
      {plan === "trial" && trialEndsAt && (
        <p className="text-muted text-xs">
          {t("trialEnds",{date:new Date(trialEndsAt).toLocaleDateString(locale)})}
        </p>
      )}
      {plan === "gifted" && giftedUntil && (
        <p className="text-muted text-xs">
          {t("giftedUntil",{date:new Date(giftedUntil).toLocaleDateString(locale)})}
        </p>
      )}
      {softLimitsApply && (
        <ul className="text-xs text-muted space-y-0.5">
          <li>
            {t("activeStudents",{count:usage.students,limit:usage.limits.maxStudents})}
          </li>
        </ul>
      )}
      <p className="text-xs text-muted">
        {t("proPrice",{price})}
      </p>
    </div>
  );
}
