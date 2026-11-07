"use client";

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
      if (!body.ok) throw new Error("Could not load workplaces");
      const options = body.data as Workplace[];
      setWorkplaces(options);
      setWorkplaceId(current => current || options[0]?.id || "");
    }).catch(() => { if (!cancelled) setError("Could not load workplaces"); });
    return () => { cancelled = true; };
  }, []);
  const workplace = workplaces.find(w => w.id === workplaceId);
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setReport(null);
    try {
      const query = new URLSearchParams({ workplaceId, from, to });
      const response = await fetch("/api/coaching/report?" + query, { cache: "no-store" });
      const body = await response.json() as ResponseBody;
      if (!response.ok || !body.report) throw new Error(body.error || "Report failed");
      setReport(body.report);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Report failed");
    } finally { setBusy(false); }
  }
  return (
    <section aria-label="Teaching activity report" dir={workplace?.locale?.startsWith("he") ? "rtl" : "ltr"}
      className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <h2 className="text-xl font-semibold">Teaching activity report</h2>
      <p className="text-sm text-muted-foreground">
        Teacher-scoped calendar-day totals; group teaching time counts once, attendance per learner.
        Cancelled lessons are excluded from teaching minutes.
      </p>
      <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">Report workplace
          <select value={workplaceId} onChange={event => { setWorkplaceId(event.target.value); setReport(null); }}
            required className="rounded border border-border bg-surface p-2">
            {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">From date
          <input type="date" required value={from} onChange={event => setFrom(event.target.value)}
            className="rounded border border-border bg-surface p-2" />
        </label>
        <label className="flex flex-col gap-1">To date
          <input type="date" required value={to} onChange={event => setTo(event.target.value)}
            className="rounded border border-border bg-surface p-2" />
        </label>
        <button type="submit" disabled={busy || !workplaceId}
          className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Calculating…" : "Generate report"}
        </button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {report && <div aria-live="polite" className="space-y-3">
        <p>Sessions: <strong>{report.sessions}</strong> · Cancelled: {report.cancelled} ·
          Teaching minutes: <strong>{report.teachingMinutes}</strong> ·
          Participants: <strong>{report.participants}</strong></p>
        <p>Present: {report.attendance.present} · Absent: {report.attendance.absent} ·
          Late: {report.attendance.late} · Excused: {report.attendance.excused} ·
          Unmarked: {report.attendance.unmarked}</p>
        <p className="text-sm">Time zone: {report.timezone} · {report.from} to {report.to}</p>
        <div className="flex gap-3">
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={() => saveReport("chesscoachpal-report.csv", "text/csv;charset=utf-8", reportCsv(report))}>
            Export CSV
          </button>
          <button type="button" className="rounded border border-border px-3 py-2"
            onClick={() => saveReport("chesscoachpal-report.txt", "text/plain;charset=utf-8", reportText(report))}>
            Export text
          </button>
        </div>
      </div>}
    </section>
  );
}
