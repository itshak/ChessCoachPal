"use client";

import {useTranslations} from "next-intl";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND_ICON_SIZE } from "@/lib/ui-constants";
import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t=useTranslations("systemUi");
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <BrandMark
          size={BRAND_ICON_SIZE.panel}
          alt="ChessCoachPal"
          className="mx-auto mb-6"
        />
        <h1 className="text-2xl font-bold mb-2">{t("errorTitle")}</h1>
        <p className="text-muted mb-6">
          {t("errorIntro")}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="bg-primary text-white rounded-lg px-6 py-2.5 text-sm font-semibold hover:bg-primary-dark transition-colors"
          >
            {t("tryAgain")}
          </button>
          <Link
            href="/"
            className="border border-border rounded-lg px-6 py-2.5 text-sm font-semibold hover:bg-surface-dim transition-colors"
          >
            {t("goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
