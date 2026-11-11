import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { AddStudentForm } from "@/components/teacher/AddStudentForm";
import { HostedLimitBanner } from "@/components/teacher/HostedLimitBanner";
import { familyDisplayName } from "@/lib/guardians";
import { ageFromBirthdate } from "@/lib/students";
import { getDeploymentMode, resolveEffectivePlan } from "@/lib/entitlements";
import {
  countActiveStudents,
  loadTeacherEntitlements,
  persistDemotionIfNeeded,
} from "@/lib/server/entitlements";

export const metadata = { title: "Students" };

interface StudentListRow {
  id: string;
  name: string;
  level: string | null;
  birthdate: string | null;
  parent_contact: string | null;
  archived_at: string | null;
  created_at: string;
  guardians: { name: string; family_name: string | null } | { name: string; family_name: string | null }[] | null;
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const params = await searchParams;
  const showArchived = params.show === "archived";

  // The default PostgREST response caps at 1,000 rows. Both the website
  // and MCP must show the complete active/archived roster, not the first
  // thousand learners silently. Stable secondary ordering prevents ties at
  // page boundaries; oversized rosters fail visibly instead of truncating.
  const students: StudentListRow[] = [];
  const guardians: Array<{id:string;name:string;family_name:string|null}> = [];
  const pageSize = 500;
  const maxRows = 20_000;
  let rosterError: string | null = null;
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    let query = supabase.from("students")
      .select("id, name, level, birthdate, parent_contact, archived_at, created_at, guardians ( name, family_name )")
      .eq("teacher_id", user.id).order("name").order("id");
    query = showArchived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) { rosterError = "Student roster could not be loaded."; break; }
    const chunk = (data ?? []) as unknown as StudentListRow[];
    if (students.length + chunk.length > maxRows) {
      rosterError = "Student roster is too large for this view. Use an export.";
      break;
    }
    students.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  for (let offset = 0; offset <= maxRows && !rosterError; offset += pageSize) {
    const {data,error} = await supabase.from("guardians")
      .select("id,name,family_name").eq("teacher_id",user.id)
      .order("name").order("id").range(offset,offset+pageSize-1);
    if(error){rosterError="Family options could not be loaded.";break;}
    const chunk=data??[];
    if(guardians.length+chunk.length>maxRows){
      rosterError="Family roster is too large for this view. Use an export.";
      break;
    }
    guardians.push(...chunk);
    if(chunk.length<pageSize)break;
  }
  // Never represent a truncated result as the full roster.
  if(rosterError)students.length=0;

  const guardianOptions = guardians.map((g) => ({
    id: g.id,
    name: familyDisplayName(g),
  }));

  let limitBanner: React.ReactNode = null;
  if (getDeploymentMode() === "hosted") {
    const stored = await loadTeacherEntitlements(supabase, user.id);
    const entitlement = resolveEffectivePlan(stored);
    await persistDemotionIfNeeded(
      supabase,
      user.id,
      stored,
      entitlement.demotedFrom
    );
    if (entitlement.softLimitsApply) {
      const activeCount = await countActiveStudents(supabase, user.id);
      if (activeCount >= entitlement.limits.maxStudents) {
        limitBanner = (
          <HostedLimitBanner
            monthlyPriceCents={entitlement.monthlyPriceCents}
            message={`Free plan allows ${entitlement.limits.maxStudents} active students. Archive one, upgrade to Pro, or export and self-host.`}
          />
        );
      }
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="text-muted text-sm mt-1">
          Select a student to review chess skills, learning observations,
          attendance, lesson notes and family information.
        </p>
        <p className="text-xs text-muted mt-2">
          {showArchived ? (
            <Link href="/students" className="text-primary font-semibold">
              Show active
            </Link>
          ) : (
            <Link
              href="/students?show=archived"
              className="text-primary font-semibold"
            >
              Show archived
            </Link>
          )}
        </p>
      </div>

      {limitBanner}
      {rosterError && <p role="alert" className="mb-4 text-sm text-error">{rosterError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {rosterError ? null : !students.length ? (
            <Card className="text-center text-muted py-12">
              <div className="text-4xl mb-3">👋</div>
              <p className="text-lg">
                {showArchived ? "No archived students" : "No students yet"}
              </p>
              {!showArchived && (
                <p className="text-sm">Add your first student using the form.</p>
              )}
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {students.map((student) => {
                const age =
                  student.birthdate != null
                    ? ageFromBirthdate(student.birthdate)
                    : null;
                const guardianRow = Array.isArray(student.guardians)
                  ? student.guardians[0]
                  : student.guardians;
                const familyLine = guardianRow
                  ? familyDisplayName(guardianRow)
                  : student.parent_contact || null;
                const subtitle = [familyLine, age !== null ? `age ${age}` : null]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Link
                    key={student.id}
                    href={`/students/${student.id}`}
                    className="block"
                  >
                    <Card
                      padding="sm"
                      className="hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-lg">
                            {student.name}
                            {student.archived_at && (
                              <span className="ml-2 text-xs font-normal text-muted">
                                Archived
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <div className="text-sm text-muted">{subtitle}</div>
                          )}
                        </div>
                        <div className="text-right text-sm text-muted">
                          {student.level ? student.level : "Chess learner"}
                        </div>                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <Card>
            <h2 className="font-semibold mb-3">Add Student</h2>
            <AddStudentForm guardians={guardianOptions} />
          </Card>
        </div>
      </div>
    </div>
  );
}
