"use client";
import {useTranslations} from "next-intl";
import {locales,localeDetails, type AppLocale} from "@/i18n/locales";

import { useEffect, useState, type FormEvent } from "react";
import { reportCsv, reportText, type ReportSummary } from "@/lib/coaching-report";

type Workplace = { id: string; name: string; locale: string };
type ResponseBody = {
  workplace?: { id: string; name: string }; report?: ReportSummary;
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
  const [reportOutputLocale,setReportOutputLocale]=useState<""|AppLocale>("");
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [workplaceId, setWorkplaceId] = useState("");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<ReportSummary | null>(null);
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
  }, []);
  const workplace = workplaces.find(w => w.id === workplaceId);
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setReport(null);
    try {
      const query = new URLSearchParams({ workplaceId, from, to });
      if(reportOutputLocale)query.set("outputLocale",reportOutputLocale);
      const response = await fetch("/api/coaching/report?" + query, { cache: "no-store" });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.report) throw new Error(body.error || t("reportFailed"));
      setReport(body.report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("reportFailed"));
    } finally { setBusy(false); }
  }
  return (
    <section aria-label="Teaching activity report" dir={workplace?.locale?.startsWith("he") ? "rtl" : "ltr"}
      className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("description")}
      </p>
      <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">{t("workplace")}
          <select value={workplaceId} onChange={event => { setWorkplaceId(event.target.value); setReport(null); }}
            required className="rounded border border-border bg-surface p-2">
            {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">{t("from")}
          <input type="date" required value={from} onChange={event => setFrom(event.target.value)}
            className="rounded border border-border bg-surface p-2" />
        </label>
        <label className="flex flex-col gap-1">{t("to")}
          <input type="date" required value={to} onChange={event => setTo(event.target.value)}
            className="rounded border border-border bg-surface p-2" />
        </label>
        <button type="submit" disabled={busy || !workplaceId}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">
          {busy ? t("generating") : t("generate")}
        </button>
        <label className="flex flex-col gap-1">{t("outputLocale")}
          <select value={reportOutputLocale} onChange={event=>setReportOutputLocale(event.target.value as ""|AppLocale)}
            className="rounded border border-border bg-surface p-2">
            <option value="">{t("workplaceDefault")}</option>
            {locales.map(locale=><option key={locale} value={locale}>{localeDetails[locale].name}</option>)}
          </select>
        </label>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {report && <div aria-live="polite" className="space-y-3">
        <p>{t("sessions")}: <strong>{report.sessions}</strong> · {t("cancelled")}: {report.cancelled} ·
          {t("teachingMinutes")}: <strong>{report.teachingMinutes}</strong> ·
          {t("participants")}: <strong>{report.participants}</strong></p>
        <p>{t("present")}: {report.attendance.present} · {t("absent")}: {report.attendance.absent} ·
          {t("late")}: {report.attendance.late} · {t("excused")}: {report.attendance.excused} ·
          {t("unmarked")}: {report.attendance.unmarked}</p>
        <p className="text-sm">{t("timezone")}: {report.timezone} · {report.from} to {report.to}</p>
        <div className="flex gap-3">
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={() => saveReport("chesscoachpal-report.csv", "text/csv;charset=utf-8", reportCsv(report,reportOutputLocale||undefined))}>
            Export CSV
          </button>
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={() => saveReport("chesscoachpal-report.txt", "text/plain;charset=utf-8", reportText(report,reportOutputLocale||undefined))}>
            Export text
          </button>
        </div>
      </div>}
    </section>
  );
}
