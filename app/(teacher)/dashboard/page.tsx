import Link from "next/link";
import {getLocale,getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { teacherDashboardPageModel } from "@/lib/server/teacher-overview-service";

export async function generateMetadata() {const t=await getTranslations("dashboard");return {title:t("title")};}

export default async function DashboardPage() {
  const t=await getTranslations("dashboard");
  const locale=await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { summary, students, upcoming, recent, teacher } =
    await teacherDashboardPageModel(supabase, user.id);
  const dateLabel = (iso: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(iso));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {teacher?.display_name ? t("welcome",{name:teacher.display_name}) : t("title")}
          </h1>
          <p className="text-sm text-muted mt-1">
            {t("description")}
          </p>
        </div>
        <Link href="/coaching" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primary-dark">
          {t("openWorkspace")}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 min-w-0">
        <Card padding="sm" className="min-w-0 [overflow-wrap:anywhere]">
          <div className="text-sm text-muted">{t("activeStudents")}</div>
          <div className="text-3xl font-bold mt-1">{summary.studentCount}</div>
          <Link href="/students" className="text-sm text-primary hover:underline">{t("manageStudents")}</Link>
        </Card>
        <Card padding="sm" className="min-w-0 [overflow-wrap:anywhere]">
          <div className="text-sm text-muted">{t("workplaces")}</div>
          <div className="text-3xl font-bold mt-1">{summary.scopedWorkplaceCount}</div>
          <Link href="/coaching" className="text-sm text-primary hover:underline">{t("manageWorkplaces")}</Link>
        </Card>
        <Card padding="sm" className="min-w-0 [overflow-wrap:anywhere]">
          <div className="text-sm text-muted">{t("classGroups")}</div>
          <div className="text-3xl font-bold mt-1">{summary.groupCount}</div>
          <Link href="/coaching" className="text-sm text-primary hover:underline">{t("viewClasses")}</Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <section>
          <h2 className="text-lg font-semibold mb-3">{t("upcoming")}</h2>
          {!upcoming?.length ? (
            <Card><p className="text-sm text-muted">{t("noUpcoming")}</p></Card>
          ) : (
            <div className="space-y-2">
              {upcoming.map(session => (
                <Card key={session.id} padding="sm">
                  <p className="font-medium break-words"><bdi dir="auto">{session.title}</bdi></p>
                  <p className="text-sm text-muted">{dateLabel(session.starts_at)} · {t("minutes",{count:session.duration_minutes})}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="text-lg font-semibold mb-3">{t("recent")}</h2>
          {!recent?.length ? (
            <Card><p className="text-sm text-muted">{t("noRecent")}</p></Card>
          ) : (
            <div className="space-y-2">
              {recent.map(session => (
                <Card key={session.id} padding="sm">
                  <p className="font-medium break-words"><bdi dir="auto">{session.title}</bdi></p>
                  <p className="text-sm text-muted">{dateLabel(session.starts_at)}</p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">{t("studentsSection")}</h2>
          <Link href="/students" className="text-sm text-primary hover:underline">{t("viewAll")}</Link>
        </div>
        {!students.length ? (
          <Card><p className="text-sm text-muted">{t("addFirstStudent")}</p></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
            {students.map(student => (
              <Card key={student.id} padding="sm" className="min-w-0 [overflow-wrap:anywhere]">
                <Link href={`/students/${student.id}`} className="font-semibold text-primary hover:underline [overflow-wrap:anywhere]"><bdi dir="auto">{student.name}</bdi></Link>
                {student.level && <p className="text-xs text-muted mt-1">{student.level}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
      <div className="mt-8">
        <Link href="/learning" className="text-primary hover:underline font-medium">
          {t("reviewLearning")}
        </Link>
      </div>
    </div>
  );
}
