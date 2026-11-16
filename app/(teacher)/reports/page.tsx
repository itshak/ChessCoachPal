import {useTranslations} from "next-intl";
import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";

export const metadata = {title: "Chess coaching reports"};

export default function ReportsPage() {
  const t=useTranslations("reports");
  return <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
      <p className="text-sm text-muted">{t("pageIntro")}</p>
    </header>
    <CoachingReportPanel />
  </main>;
}
