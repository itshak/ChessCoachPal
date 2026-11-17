import {getTranslations} from "next-intl/server";
import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";

export async function generateMetadata(){
  const t=await getTranslations("reports");
  return {title:t("pageTitle")};
}

export default async function ReportsPage() {
  const t=await getTranslations("reports");
  return <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
      <p className="text-sm text-muted">{t("pageIntro")}</p>
    </header>
    <CoachingReportPanel />
  </main>;
}
