import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";

export const metadata = {title: "Chess coaching reports"};

export default function ReportsPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold">Teaching reports</h1>
      <p className="text-sm text-muted">Review actual teaching sessions and workplace activity. Group lessons count instructor time once.</p>
    </header>
    <CoachingReportPanel />
  </main>;
}
