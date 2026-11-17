"use client";

import {useSyncExternalStore} from "react";
import {messagesFor} from "@/i18n/messages";
import {
  localeCookie,languageDirection,supportedLocale,type AppLocale
} from "@/i18n/locales";
import { BrandMark } from "@/components/brand/BrandMark";
import { BRAND_ICON_SIZE } from "@/lib/ui-constants";

// This boundary replaces the root layout and therefore cannot assume that
// NextIntlClientProvider survived. Use the validated public locale cookie
// and browser preference, with an English server/hydration-safe fallback.
function emergencyLocale():AppLocale {
  const raw=document.cookie.split(";").map(part=>part.trim())
    .find(part=>part.startsWith(localeCookie+"="))?.slice(localeCookie.length+1);
  let cookieValue:string|undefined;
  try{cookieValue=raw?decodeURIComponent(raw):undefined;}catch{cookieValue=undefined;}
  return supportedLocale(cookieValue)??supportedLocale(navigator.language)??"en";
}

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale=useSyncExternalStore(
    () => () => {},
    emergencyLocale,
    ():AppLocale => "en"
  );
  const t=messagesFor(locale).systemUi;
  return (
    <html lang={locale} dir={languageDirection(locale)}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1829",
          color: "#EAF3F4",
          fontFamily:
            '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <BrandMark
            size={BRAND_ICON_SIZE.panel}
            alt="ChessCoachPal"
            className="mb-6"
          />
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "0.5rem",
            }}
          >
            {t.errorTitle}
          </h1>
          <p style={{ color: "#9BAEB7", marginBottom: "1.5rem" }}>
            {t.errorIntro}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#2a9d8f",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.tryAgain}
          </button>
        </div>
      </body>
    </html>
  );
}
