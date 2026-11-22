import {getTranslations} from "next-intl/server";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";

export async function generateMetadata(){
  const t=await getTranslations("reports");
  return {title:t("pageTitle")};
}

export default async function ReportsPage() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)redirect("/login");
  const [t,context]=await Promise.all([getTranslations("reports"),teacherWorkplaceContextGet(db,user.id)]);
  return <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <header>
      <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
      <p className="text-sm text-muted">{t("pageIntro")}</p>
    </header>
    <CoachingReportPanel initialWorkplaceId={context.selectedWorkplaceId} />
  </main>;
}
