"use client";

import {useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {locales, localeDetails, type AppLocale} from "@/i18n/locales";

export function LanguageSwitcher({authenticated = false, compact = false}: {
  authenticated?: boolean; compact?: boolean;
}) {
  const current = useLocale();
  const t = useTranslations("language");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function select(locale: AppLocale) {
    if (locale === current || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(authenticated ? "/api/auth/update-profile" : "/api/preferences/locale", {
        method: authenticated ? "PUT" : "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(authenticated ? {preferredLocale: locale} : {locale}),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(t("failed"));
      // Reload updates root HTML lang/dir without stale direction during hydration.
      window.location.reload();
    } catch {
      setError(t("failed")); setPending(false);
    }
  }
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-1"}>
      <label className={compact ? "text-xs text-muted" : "block text-sm font-medium"} htmlFor={compact ? "compact-language" : "account-language"}>
        {t("label")}
      </label>
      <select
        id={compact ? "compact-language" : "account-language"}
        aria-label={t("label")} value={current}
        onChange={event => void select(event.target.value as AppLocale)}
        disabled={pending}
        className="rounded-lg border border-border bg-surface text-foreground px-2 py-1.5 text-sm"
      >
        {locales.map(locale => <option key={locale} value={locale} lang={locale}>{localeDetails[locale].name}</option>)}
      </select>
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </div>
  );
}
