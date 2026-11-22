import Link from "next/link";
import {getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AddStudentForm } from "@/components/teacher/AddStudentForm";
import { ageFromBirthdate } from "@/lib/students";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import {workplaceCurrentStudentIds} from "@/lib/server/workplace-student-scope";
import {
  loadAccountEntitlementSummary,
  reachedStudentCapacity,
} from "@/lib/server/entitlements";

export async function generateMetadata(){
  const t=await getTranslations("students");return {title:t("title")};
}

interface StudentListRow {
  id: string;
  name: string;
  level: string | null;
  birthdate: string | null;
  archived_at: string | null;
  created_at: string;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const t=await getTranslations("students");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const params = await searchParams;
  const showArchived = params.show === "archived";
  const context=await teacherWorkplaceContextGet(supabase,user.id);
  const currentStudentIds=context.selectedWorkplaceId?
    await workplaceCurrentStudentIds(supabase,user.id,context.selectedWorkplaceId):null;

  // The default PostgREST response caps at 1,000 rows. Both the website
  // and MCP must show the complete active/archived roster, not the first
  // thousand learners silently. Stable secondary ordering prevents ties at
  // page boundaries; oversized rosters fail visibly instead of truncating.
  const students: StudentListRow[] = [];
  const pageSize = 500;
  const maxRows = 20_000;
  let rosterError: string | null = null;
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    let query = supabase.from("students")
      .select("id, name, level, birthdate, archived_at, created_at")
      .eq("teacher_id", user.id).order("name").order("id");
    query = showArchived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) { rosterError = t("rosterLoadFailed"); break; }
    const chunk = (data ?? []) as unknown as StudentListRow[];
    if (offset + chunk.length > maxRows) {
      rosterError = t("rosterTooLarge");
      break;
    }
    students.push(...(currentStudentIds?
      chunk.filter(student=>currentStudentIds.has(student.id)):chunk));
    if (chunk.length < pageSize) break;
  }
  // Contacts are managed independently on each student profile. A student
  // does not need a household/guardian, and no household grants portal rights.
  if(rosterError)students.length=0;

  const [entitlements, tHosted] = await Promise.all([
    loadAccountEntitlementSummary(supabase).catch(() => null),
    getTranslations("hosted"),
  ]);
  const limit = entitlements ? reachedStudentCapacity(entitlements) : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("intro")}
        </p>
        <p className="text-xs text-muted mt-2">
          {showArchived ? (
            <Link href="/students" className="text-primary font-semibold">
              {t("showActive")}
            </Link>
          ) : (
            <Link
              href="/students?show=archived"
              className="text-primary font-semibold"
            >
              {t("showArchived")}
            </Link>
          )}
        </p>
      </div>

      {!entitlements && <p role="status" className="mb-4 text-sm">{t("capacityUnavailable")}</p>}
      {entitlements && limit !== null && (
        <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {tHosted("activeStudents", { count: entitlements.activeStudentCount, limit })}
        </p>
      )}
      {rosterError && <p role="alert" className="mb-4 text-sm text-error">{rosterError}</p>}

      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="min-w-0 lg:col-span-2">
          {rosterError ? null : !students.length ? (
            <Card className="text-center text-muted py-12">
              <div className="text-4xl mb-3">👋</div>
              <p className="text-lg">
                {showArchived ? t("noArchived") : t("noStudents")}
              </p>
              {!showArchived && (
                <p className="text-sm">{t("addFirst")}</p>
              )}
            </Card>
          ) : (
            <div className="flex min-w-0 flex-col gap-3">
              {students.map((student) => {
                const age =
                  student.birthdate != null
                    ? ageFromBirthdate(student.birthdate)
                    : null;
                const subtitle=age!==null?t("age",{age}):null;

                return (
                  <Link
                    key={student.id}
                    href={`/students/${student.id}`}
                    className="block min-w-0"
                  >
                    <Card
                      padding="sm"
                      className="min-w-0 hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1">
                          <div className="min-w-0 font-semibold text-lg break-words [overflow-wrap:anywhere]">
                            <bdi dir="auto">{student.name}</bdi>
                            {student.archived_at && (
                              <span className="ms-2 text-xs font-normal text-muted">
                                {t("archivedTag")}
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <div className="min-w-0 text-sm text-muted break-words [overflow-wrap:anywhere]">
                              <bdi dir="auto">{subtitle}</bdi>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 max-w-full text-end text-sm text-muted break-words [overflow-wrap:anywhere]">
                          <bdi dir="auto">{student.level ? student.level : t("learner")}</bdi>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <Card>
            <h2 className="font-semibold mb-3">{t("addButton")}</h2>
            <AddStudentForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
