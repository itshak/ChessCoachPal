"use client";
import {useLocale,useTranslations} from "next-intl";
import {locales,localeDetails, type AppLocale} from "@/i18n/locales";

import { useEffect, useState, type FormEvent } from "react";
import { reportCsv, reportText, type ReportSummary, type ReportPresentation } from "@/lib/coaching-report";

type Workplace = { id: string; name: string; locale: string };
type ResponseBody = {
  workplace?: { id: string; name: string }; report?: ReportSummary;
  presentation?: ReportPresentation;
  error?: string;
};
const today = new Date().toISOString().slice(0, 10);

function saveReport(filename: string, type: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CoachingReportPanel() {
  const t=useTranslations("reports");
  const uiLocale=useLocale();
  const [reportOutputLocale,setReportOutputLocale]=useState<""|AppLocale>("");
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [workplaceId, setWorkplaceId] = useState("");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [presentation,setPresentation]=useState<ReportPresentation|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/v1", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "workplaces.list" }), cache: "no-store",
    }).then(response => response.json()).then(body => {
      if (cancelled) return;
      if (!body.ok) throw new Error(t("loadFailed"));
      const options = body.data as Workplace[];
      setWorkplaces(options);
      setWorkplaceId(current => current || options[0]?.id || "");
    }).catch(() => { if (!cancelled) setError(t("loadFailed")); });
    return () => { cancelled = true; };
  }, [t]);
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setReport(null);setPresentation(null);
    try {
      const query = new URLSearchParams({ workplaceId, from, to });
      if(reportOutputLocale)query.set("outputLocale",reportOutputLocale);
      const response = await fetch("/api/coaching/report?" + query, { cache: "no-store" });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.report) throw new Error(body.error || t("reportFailed"));
      setReport(body.report);
      setPresentation(body.presentation??null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("reportFailed"));
    } finally { setBusy(false); }
  }
  return (
    <section aria-label={t("title")} dir={uiLocale==="he"?"rtl":"ltr"}
      className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("description")}
      </p>
      <form onSubmit={generate} className="flex min-w-0 flex-wrap items-end gap-3">
        <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">{t("workplace")}
          <select value={workplaceId} onChange={event => { setWorkplaceId(event.target.value); setReport(null); }}
            required className="w-full min-w-0 max-w-full rounded border border-border bg-surface p-2">
            {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">{t("from")}
          <input type="date" required value={from} onChange={event => setFrom(event.target.value)}
            className="w-full min-w-0 max-w-full rounded border border-border bg-surface p-2" />
        </label>
        <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">{t("to")}
          <input type="date" required value={to} onChange={event => setTo(event.target.value)}
            className="w-full min-w-0 max-w-full rounded border border-border bg-surface p-2" />
        </label>
        <button type="submit" disabled={busy || !workplaceId}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">
          {busy ? t("generating") : t("generate")}
        </button>
        <label className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:max-w-full">{t("outputLocale")}
          <select value={reportOutputLocale} onChange={event=>{
              setReportOutputLocale(event.target.value as ""|AppLocale);
              setReport(null);setPresentation(null);
            }}
            className="w-full min-w-0 max-w-full rounded border border-border bg-surface p-2">
            <option value="">{t("workplaceDefault")}</option>
            {locales.map(locale=><option key={locale} value={locale}>{localeDetails[locale].name}</option>)}
          </select>
        </label>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {report && presentation && <div
        aria-live="polite" dir={presentation.direction} className="space-y-3">
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {presentation.metrics.map(item=><span key={item.key}>
            {item.label}: <strong>{item.value}</strong>
          </span>)}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          {presentation.attendance.map(item=><span key={item.status}>
            {item.label}: <strong>{item.value}</strong>
          </span>)}
        </p>
        <p className="text-sm">{presentation.periodLabel}: {presentation.period} ·{" "}
          {presentation.timezoneLabel}: <bdi dir="ltr">{presentation.timezone}</bdi>
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={()=>saveReport("chesscoachpal-report.csv","text/csv;charset=utf-8",
              reportCsv(report,presentation.outputLocale))}>
            {t("exportCsv")}
          </button>
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={()=>saveReport("chesscoachpal-report.txt","text/plain;charset=utf-8",
              reportText(report,presentation.outputLocale))}>
            {t("exportText")}
          </button>
        </div>
      </div>}
    </section>
  );
}
