import Link from "next/link";
import {getTranslations} from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AddStudentForm } from "@/components/teacher/AddStudentForm";
import { ageFromBirthdate } from "@/lib/students";
import {teacherStudentsRoster} from "@/lib/server/student-profile-service";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import {
  loadAccountEntitlementSummary,
  reachedStudentCapacity,
} from "@/lib/server/entitlements";

interface StudentListRow {
  id: string;
  name: string;
  level: string | null;
  birthdate: string | null;
  archived_at: string | null;
  created_at: string;
  name_aliases?: string[] | null;
}

export async function StudentDirectory({
  searchParams, selectedId,
}: {
  searchParams: Promise<{ show?: string; q?: string }>;
  selectedId?: string;
}) {
  const t=await getTranslations("students");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const params = await searchParams;
  const showArchived = params.show === "archived";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const common = await getTranslations("common");
  const filterHref = (archived: boolean) => {
    const q = new URLSearchParams();
    if (archived) q.set("show", "archived");
    if (query) q.set("q", query);
    return "/students" + (q.size ? "?" + q.toString() : "");
  };
  const detailHref = (id: string) => filterHref(showArchived).replace("/students", `/students/${id}`);
  // The roster opts into selected workplace context; global identity
  // choosers keep their existing unscoped list.
  // Oversized scoped rosters fail visibly instead of truncating.
  const students: StudentListRow[] = [];
  const pageSize = 500;
  const maxRows = 20_000;
  let rosterError: string | null = null;
  // Keep one effective selection across all pages in this render.
  let workplaceId:string|null=null;
  try{workplaceId=(await teacherWorkplaceContextGet(supabase,user.id)).selectedWorkplaceId;}
  catch{rosterError=t("rosterLoadFailed");}
  for (let offset = 0; !rosterError&&offset <= maxRows; offset += pageSize) {
    try{
      const page=await teacherStudentsRoster(supabase,user.id,{
        workplaceId,archivedOnly:showArchived,query,offset,limit:pageSize,
      });
      if(offset+page.students.length>maxRows||page.nextOffset!==null&&page.nextOffset>=maxRows){
        rosterError=t("rosterTooLarge");
        break;
      }
      students.push(...page.students as unknown as StudentListRow[]);
      if(page.nextOffset===null)break;
    }catch{
      rosterError=t("rosterLoadFailed");
      break;
    }
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
        {selectedId ? <h2 className="text-lg font-bold">{t("title")}</h2> : <h1 className="text-2xl font-bold">{t("title")}</h1>}
        {!selectedId && <p className="text-muted text-sm mt-1">{t("intro")}</p>}
        <p className="text-xs text-muted mt-2">
          {showArchived ? (
            <Link href={filterHref(false)} className="text-primary font-semibold">
              {t("showActive")}
            </Link>
          ) : (
            <Link
              href={filterHref(true)}
              className="text-primary font-semibold"
            >
              {t("showArchived")}
            </Link>
          )}
        </p>
      </div>

      <form action="/students" method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        {showArchived && <input type="hidden" name="show" value="archived" />}
        <label className="min-w-0 flex-1 text-sm font-medium">
          {t("search")}
          <input name="q" type="search" key={query} defaultValue={query} maxLength={80} dir="auto" className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base" />
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-border px-4 font-semibold text-primary">{common("search")}</button>
        {query && <Link href={showArchived ? "/students?show=archived" : "/students"} className="min-h-11 content-center px-3 text-primary">{common("cancel")}</Link>}
      </form>

      {!entitlements && <p role="status" className="mb-4 text-sm">{t("capacityUnavailable")}</p>}
      {entitlements && limit !== null && (
        <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          {tHosted("activeStudents", { count: entitlements.activeStudentCount, limit })}
        </p>
      )}
      {rosterError && <p role="alert" className="mb-4 text-sm text-error">{rosterError}</p>}

      <div className={selectedId ? "min-w-0" : "grid min-w-0 grid-cols-1 lg:grid-cols-3 gap-6"}>
        <div className={selectedId ? "min-w-0" : "min-w-0 lg:col-span-2"}>
          {rosterError ? null : !students.length ? (
            <Card className="text-center text-muted py-12">
              <div className="text-4xl mb-3">👋</div>
              <p className="text-lg">
                {query ? common("noResults") : showArchived ? t("noArchived") : t("noStudents")}
              </p>
              {!showArchived && !query && (
                <p className="text-sm">{t("addFirst")}</p>
              )}
            </Card>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              {students.map((student) => {
                const age =
                  student.birthdate != null
                    ? ageFromBirthdate(student.birthdate)
                    : null;
                const subtitle=age!==null?t("age",{age}):null;

                return (
                  <Link
                    key={student.id}
                    href={detailHref(student.id)}
                    aria-current={selectedId === student.id ? "page" : undefined}
                    data-student-directory-id={student.id}
                    className="block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Card
                      padding="sm"
                      className={selectedId === student.id ? "min-w-0 border-primary bg-primary/10" : "min-w-0 hover:border-primary/40 transition-colors cursor-pointer"}
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
                          {Boolean(student.name_aliases?.length) && <p className="text-sm text-muted break-words"><bdi dir="auto">{student.name_aliases?.join(" · ")}</bdi></p>}
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

        {!selectedId && <details open className="self-start rounded-xl border border-border bg-surface p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">{t("addButton")}</summary>
          <div className="pt-3"><AddStudentForm /></div>
        </details>}
      </div>
    </div>
  );
}
