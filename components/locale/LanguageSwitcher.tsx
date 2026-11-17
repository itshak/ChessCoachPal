"use client";

import {useEffect,useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {isAppLocale,locales, localeDetails, type AppLocale} from "@/i18n/locales";

// Inter-tab UI synchronization only; no personal records or login state
// travel over this channel. The server remains the source of truth.
const CHANNEL="ccp-locale-updated";
function notifyOtherTabs(locale:AppLocale){
  try{
    if(typeof BroadcastChannel!=="undefined"){
      const channel=new BroadcastChannel(CHANNEL);
      channel.postMessage(locale);
      channel.close();
    }else{
      localStorage.setItem(CHANNEL,`${locale}:${Date.now()}`);
    }
  }catch{/* Private browsing/storage restrictions: current tab still reloads. */}
}

export function LanguageSwitcher({authenticated = false, compact = false}: {
  authenticated?: boolean; compact?: boolean;
}) {
  const current = useLocale();
  const t = useTranslations("language");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(()=>{
    let channel:BroadcastChannel|null=null;
    const sync=(next:unknown)=>{
      if(isAppLocale(next)&&next!==current)window.location.reload();
    };
    const onStorage=(event:StorageEvent)=>{
      if(event.key===CHANNEL)sync(event.newValue?.split(":")[0]);
    };
    try{
      if(typeof BroadcastChannel!=="undefined"){
        channel=new BroadcastChannel(CHANNEL);
        channel.onmessage=event=>sync(event.data);
      }else window.addEventListener("storage",onStorage);
    }catch{
      window.addEventListener("storage",onStorage);
    }
    return ()=>{channel?.close();window.removeEventListener("storage",onStorage);};
  },[current]);
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
      // Reload updates root HTML lang/dir without stale direction during
      // hydration; notify other open tabs that they must get the new SSR locale.
      notifyOtherTabs(locale);
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
