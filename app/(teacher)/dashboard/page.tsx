import Link from "next/link";
import {getLocale,getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import {dailyLessonPreparationInput,DailyPreparationError,teacherDailyLessonPreparation} from "@/lib/server/daily-lesson-preparation";
import { teacherDashboardPageModel, teacherDashboardSummaryInput } from "@/lib/server/teacher-overview-service";

export async function generateMetadata() {const t=await getTranslations("dashboard");return {title:t("title")};}

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ date?: string | string[]; homeworkAfter?: string | string[]; prepareSession?: string | string[] }>;
}) {
  const t=await getTranslations("dashboard");
  const locale=await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { date: rawDate, homeworkAfter, prepareSession } = await searchParams;
  const filters = teacherDashboardSummaryInput.safeParse({ date: rawDate, homeworkAfter });
  const { summary, students, upcoming, recent, teacher, daily } =
    await teacherDashboardPageModel(supabase, user.id, filters.success ? filters.data.date : undefined,
      filters.success ? filters.data.homeworkAfter : undefined);
  const preparationInput=dailyLessonPreparationInput.safeParse({sessionId:prepareSession});
  const preparation=prepareSession===undefined ? null : !preparationInput.success ? {kind:"invalid" as const}
    : await teacherDailyLessonPreparation(supabase,user.id,preparationInput.data.sessionId)
      .then(data=>({kind:"ready" as const,data}))
      .catch((error:unknown)=>({kind:error instanceof DailyPreparationError && error.status===404
        ? "not_found" as const : "unavailable" as const}));
  const dailyTime = daily && new Intl.DateTimeFormat(locale, {
    timeZone: daily.timeZone, timeStyle: "short",
  });
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
          <Link href="/schedule" className="block rounded-sm hover:underline focus-visible:outline-2"
            aria-label={t("openWorkplaceSchedule",{count:summary.scopedWorkplaceCount})}>
            <div className="text-sm text-muted">{t("workplaces")}</div>
            <div className="text-3xl font-bold mt-1">{summary.scopedWorkplaceCount}</div>
          </Link>
          <Link href="/coaching#manage-workplaces" className="text-sm text-primary hover:underline">{t("manageWorkplaces")}</Link>
        </Card>
        <Card padding="sm" className="min-w-0 [overflow-wrap:anywhere]">
          <div className="text-sm text-muted">{t("classGroups")}</div>
          <div className="text-3xl font-bold mt-1">{summary.groupCount}</div>
          <Link href="/coaching" className="text-sm text-primary hover:underline">{t("viewClasses")}</Link>
        </Card>
      </div>

      <section aria-labelledby="daily-coaching" className="mb-8">
        <h2 id="daily-coaching" className="text-lg font-semibold mb-3">{t("dailyHeading")}</h2>
        <form action="/dashboard" method="get" className="flex flex-wrap items-end gap-3 mb-3">
          <label className="grid gap-1">
            {t("dailyDate")}
            <input name="date" type="date" min="1900-01-01" max="9998-12-31" required
              defaultValue={daily?.date} className="rounded border px-2 py-1" />
          </label>
          <button type="submit" className="rounded border px-3 py-1">{t("dailyShow")}</button>
          {rawDate !== undefined && <Link href="/dashboard" className="text-primary underline">{t("dailyReset")}</Link>}
        </form>
        {!filters.success ? <p role="alert">{t("dailyInvalid")}</p>
          : !daily || !dailyTime ? <p role="alert">{t("dailyUnavailable")}</p>
          : <>
            <p className="text-sm text-muted mb-2">{t("dailyZone", { zone: daily.timeZone })}</p>
            {daily.sessions.length === 0 ? <p>{t("dailyEmpty")}</p> : (
              <ul className="space-y-2">
                {daily.sessions.map(session => (
                  <li key={session.id}>
                    <Card padding="sm">
                      <p className="font-medium break-words"><bdi dir="auto">{session.title}</bdi></p>
                      <p className="text-sm text-muted">
                        <time dateTime={session.starts_at}>{dailyTime.format(new Date(session.starts_at))}</time>
                        {" · "}{t("minutes", { count: session.duration_minutes })}
                      </p>
                      <Link className="text-primary underline" href={"/dashboard?date="+daily.date+
                        "&prepareSession="+session.id+"#lesson-preparation"}>
                        {t("dailyPrepareOpen",{title:session.title})}
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            {daily.truncated && <p className="mt-2">{t("dailyTruncated", { count: daily.limit })}</p>}
          </>}
      </section>

      {preparation && <section aria-labelledby="lesson-preparation" className="mb-8">
        <h2 id="lesson-preparation" className="text-lg font-semibold mb-3">{t("dailyPrepareHeading")}</h2>
        {preparation.kind !== "ready" ? <p role="alert">{t(preparation.kind === "invalid" ? "dailyPrepareInvalid"
          : preparation.kind === "not_found" ? "dailyPrepareNotFound" : "dailyPrepareUnavailable")}</p> : <>
          <h3><bdi dir="auto">{preparation.data.lesson.title}</bdi></h3>
          {!preparation.data.history ? <p>{t(preparation.data.status === "roster_not_recorded"
            ? "dailyPrepareUnknownRoster" : "dailyPrepareRosterLimit")}</p> :
            <div className="space-y-2">
              <p>{t("dailyPrepareParticipants",{count:preparation.data.participantCount})}</p>
              <p>{t("dailyPrepareHistory",{from:preparation.data.history.from,to:preparation.data.history.to})}</p>
              {preparation.data.history.material.status === "not_recorded" && <p>{t("dailyPrepareNoMaterials")}</p>}
              {preparation.data.history.material.status === "truncated" && <p>{t("dailyPrepareLimited")}</p>}
              {preparation.data.history.material.participantsWithoutEvidence !== null &&
                <p>{t("dailyPrepareUnknownCount",{count:preparation.data.history.material.participantsWithoutEvidence})}</p>}
              {!!preparation.data.history.material.entries.length && <ul>
                {preparation.data.history.material.entries.map(item=><li key={item.sourceId}>
                  <bdi dir="auto">{item.title ?? t("dailyHomeworkUnknownMaterial")}</bdi>{" · "}
                  {t(item.stage === "assigned" ? "dailyPrepareAssigned" : item.stage === "taught"
                    ? "dailyPrepareTaught" : "dailyPrepareCompleted")}
                </li>)}
              </ul>}
              <p>{t("dailyPrepareAssignments",{count:preparation.data.history.assignments.count})}</p>
              <p>{t("dailyPrepareObservations",{count:preparation.data.history.verifiedObservations.count})}</p>
              <p>{t("dailyPrepareNoMastery")}</p>
            </div>}
        </>}
      </section>}

      {filters.success && daily && dailyTime && <section aria-labelledby="daily-attendance" className="mb-8">
        <h2 id="daily-attendance" className="text-lg font-semibold mb-3">{t("dailyAttendanceHeading")}</h2>
        {daily.missingAttendance.status === "unavailable" ? <p role="alert">{t("dailyAttendanceUnavailable")}</p> : <>
          {!daily.missingAttendance.sessions.length && !daily.missingAttendance.truncated &&
            <p>{t("dailyAttendanceEmpty")}</p>}
          {!!daily.missingAttendance.sessions.length && <ul className="space-y-2">
            {daily.missingAttendance.sessions.map(row => <li key={row.id}>
              <Card padding="sm">
                <p className="font-medium break-words"><bdi dir="auto">{row.title}</bdi></p>
                <p className="text-sm">
                  <time dateTime={row.starts_at}>{dailyTime.format(new Date(row.starts_at))}</time>
                  {" · "}{row.reason === "ATTENDANCE_MISSING" ? t("dailyAttendanceMissing", { count: row.missingCount })
                    : row.reason === "ROSTER_NOT_RECORDED" ? t("dailyAttendanceUnknown") : t("dailyAttendanceRosterLimit")}
                </p>
                {row.scheduleHref && <Link href={row.scheduleHref} className="text-primary underline">
                  {t("dailyAttendanceOpen", { title: row.title })}
                </Link>}
                {row.completionHref && <Link href={row.completionHref} className="block text-primary underline">
                  {t("dailyCloseOpen",{title:row.title})}
                </Link>}

              </Card>
            </li>)}
          </ul>}
          {daily.missingAttendance.truncated && <p className="mt-2">{t("dailyAttendanceTruncated")}</p>}
        </>}
      </section>}

      {filters.success && daily && <section aria-labelledby="daily-homework" className="mb-8">
        <h2 id="daily-homework" className="text-lg font-semibold mb-3">{t("dailyHomeworkHeading")}</h2>
        {daily.homework.status === "workplace_scope_unavailable" ? <p>{t("dailyHomeworkAllOnly")}</p>
          : daily.homework.status === "unavailable" ? <p role="alert">{t("dailyHomeworkUnavailable")}</p>
          : <>
            <p className="text-sm text-muted mb-2">{t("dailyHomeworkWindow", { date: daily.homework.dueThrough })}</p>
            {daily.homework.assignments.length === 0 && <p>{t(daily.homework.nextAfter || homeworkAfter
              ? "dailyHomeworkEmptyPage" : "dailyHomeworkEmpty")}</p>}
            {!!daily.homework.assignments.length && <ul className="space-y-2">
              {daily.homework.assignments.map(row => <li key={row.assignmentId}>
                <Card padding="sm">
                  <p className="font-medium break-words"><bdi dir="auto">{row.materialTitle ?? t("dailyHomeworkUnknownMaterial")}</bdi></p>
                  <p className="text-sm"><time dateTime={row.dueOn}>{row.dueOn}</time>{" · "}
                    {t(row.reason === "SUBMISSION_AWAITING_REVIEW" ? "dailyHomeworkReview"
                      : row.reason === "REVIEW_NEEDS_WORK" ? "dailyHomeworkNeedsWork"
                      : row.reason === "DUE_AWAITING_SUBMISSION" ? "dailyHomeworkAwaiting" : "dailyHomeworkEvidenceLimit")}</p>
                  <Link className="text-primary underline" prefetch={false}
                    href={"/learning?" + new URLSearchParams({dailyHomework:row.assignmentId,dueThrough:daily.date}) + "#daily-homework-focus"}>
                    {t("dailyHomeworkOpen", { material:row.materialTitle ?? t("dailyHomeworkUnknownMaterial"), date:row.dueOn })}
                  </Link>
                </Card>
              </li>)}
            </ul>}
            {daily.homework.nextAfter && <Link className="text-primary underline"
              href={"/dashboard?date=" + daily.date + "&homeworkAfter=" + encodeURIComponent(daily.homework.nextAfter) + "#daily-homework"}>
              {t("dailyHomeworkNext")}
            </Link>}
          </>}
      </section>}

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
