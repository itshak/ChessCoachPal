import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";
import { ArchiveStudentButton } from "@/components/teacher/ArchiveStudentButton";
import { RemoveStudentButton } from "@/components/teacher/RemoveStudentButton";
import { StudentNotesEditor } from "@/components/teacher/StudentNotesEditor";
import { StudentLessonNotes } from "@/components/teacher/StudentLessonNotes";
import { StudentInfoCard } from "@/components/teacher/StudentInfoCard";
import { StudentChessProfileEditor } from "@/components/teacher/StudentChessProfileEditor";
import { UnifiedLessonHistoryPanel } from "@/components/teacher/UnifiedLessonHistoryPanel";
import { EditableStudentName } from "@/components/teacher/EditableStudentName";
import { SkillsPanel } from "@/components/teacher/skills/SkillsPanel";
import { CreditPackagesCard } from "@/components/teacher/billing/CreditPackagesCard";
import { getOrSeedDimensions } from "@/lib/server/skills";
import { getPolicy } from "@/lib/server/scheduling";
import { loadCreditBalances } from "@/lib/server/credits";
import { familyDisplayName } from "@/lib/guardians";
import { oneToOne, toLocalDateString } from "@/lib/schedule";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { title: "Student" };
  const { data } = await supabase.from("students").select("name").eq("id", id).eq("teacher_id", user.id).maybeSingle();
  return { title: data?.name ?? "Student" };
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: student },
    dimensions,
    { data: assessments },
    { data: attendedLessons },
    { data: lessonNoteRows },
    policy,
  ] = await Promise.all([
    supabase.from("students").select("*, guardians ( id, name, family_name, email )")
      .eq("id", id).eq("teacher_id", user.id).single(),
    getOrSeedDimensions(supabase, user.id),
    supabase.from("skill_assessments").select("id, dimension_id, rating, assessed_on, created_at")
      .eq("student_id", id).order("assessed_on").order("created_at"),
    supabase.from("lessons").select("id, lesson_date, attendance!lesson_id ( status )")
      .eq("student_id", id).order("lesson_date", { ascending: false }),
    supabase.from("lesson_notes")
      .select("id, body, private_body, shared_with_parent, emailed_at, updated_at, lessons!inner ( lesson_date, student_id )")
      .eq("lessons.student_id", id).order("updated_at", { ascending: false }),
    getPolicy(supabase, user.id),
  ]);
  if (!student) notFound();

  const attendanceCounts: Record<string, number> = {};
  for (const row of attendedLessons ?? []) {
    const status = oneToOne(row.attendance)?.status;
    if (status) attendanceCounts[status] = (attendanceCounts[status] ?? 0) + 1;
  }
  const markedLessons = Object.values(attendanceCounts).reduce((a,b) => a + b, 0);
  const attendanceRate = markedLessons ? Math.round(100 * (attendanceCounts.attended ?? 0) / markedLessons) : null;

  const lessonNotes = (lessonNoteRows ?? []).flatMap((row) => {
    const lesson = oneToOne(row.lessons as
      | { lesson_date: string; student_id: string }
      | { lesson_date: string; student_id: string }[] | null);
    if (!lesson || !(row.body?.trim() || row.private_body?.trim())) return [];
    return [{
      id: row.id,
      body: row.body ?? "",
      privateBody: row.private_body ?? "",
      sharedWithParent: row.shared_with_parent,
      emailedAt: row.emailed_at,
      lessonDate: lesson.lesson_date,
      updatedAt: row.updated_at,
    }];
  });

  const [creditPackages, { data: activeSlot }] = await Promise.all([
    loadCreditBalances(supabase, user.id, policy, [id], toLocalDateString(new Date(), policy.timezone)),
    supabase.from("lesson_slots").select("duration_minutes, rate_cents")
      .eq("student_id", id).eq("active", true).order("start_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div>
      <Link href="/students" className="inline-block mb-6 text-muted hover:text-foreground">← Students</Link>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <EditableStudentName studentId={id} initialName={student.name} />
          {student.guardians ? (
            <p className="text-muted text-sm">
              Family:{" "}
              <Link href={`/families/${student.guardians.id}`} className="hover:text-primary transition-colors">
                {familyDisplayName(student.guardians)}
              </Link>
            </p>
          ) : student.parent_contact ? (
            <p className="text-muted text-sm">{student.parent_contact}</p>
          ) : (
            <Link href="/families" className="text-sm text-primary hover:underline">Link a family</Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ArchiveStudentButton studentId={id} studentName={student.name} archived={Boolean(student.archived_at)} />
          <RemoveStudentButton studentId={id} studentName={student.name} />
        </div>
      </div>

      <StudentInfoCard
        studentId={id}
        initialLevel={student.level ?? null}
        initialBirthdate={student.birthdate ?? null}
        initialPracticeStartDate={student.practice_start_date ?? null}
        createdAt={student.created_at}
        initialDefaultRateCents={student.default_rate_cents ?? null}
        initialTravelFeeCents={student.travel_fee_cents ?? null}
      />
      <StudentChessProfileEditor
        studentId={id}
        initialAliases={student.name_aliases ?? []}
        initialStrength={student.strength ?? null}
        initialLichessUsername={student.lichess_username ?? null}
        initialChesscomUsername={student.chesscom_username ?? null}
        initialLichessRating={student.lichess_rating ?? null}
        initialChesscomRating={student.chesscom_rating ?? null}
        initialGoals={student.chess_goals ?? ""}
        initialRatings={student.chess_ratings ?? {}}
      />
      <CreditPackagesCard
        studentId={id}
        hasFamily={Boolean(student.guardian_id)}
        currency={policy.currency}
        packages={creditPackages.map(pkg => ({
          id: pkg.id, invoiceId: pkg.invoiceId,
          credits: pkg.credits, durationMinutes: pkg.durationMinutes,
          priceCents: pkg.priceCents, startsOn: pkg.startsOn, expiresOn: pkg.expiresOn,
          usedCredits: pkg.balance.usedCredits, pendingCredits: pkg.balance.pendingCredits,
          remainingCredits: pkg.balance.remainingCredits, state: pkg.balance.state,
          redemptions: pkg.redemptions,
        }))}
        defaultDurationMinutes={activeSlot?.duration_minutes ?? 30}
        rate={{
          slotRateCents: activeSlot?.rate_cents ?? null,
          studentDefaultRateCents: student.default_rate_cents ?? null,
          studioDefaultRateCents: policy.default_rate_cents,
        }}
        durationRates={policy.duration_rate_cents}
        rateBasis={policy.rate_basis}
      />

      <StudentNotesEditor
        key={(student.teacher_notes ?? "").length}
        studentId={id}
        initialNotes={student.teacher_notes ?? ""}
      />
      <StudentLessonNotes notes={lessonNotes} timezone={policy.timezone} />
      <div className="mb-8"><UnifiedLessonHistoryPanel fixedStudentId={id}/></div>
      <div className="mb-8"><MaterialHistoryPanel fixedStudentId={id} /></div>

      <h2 className="text-lg font-semibold mb-3">Progress</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <SkillsPanel studentId={id} dimensions={dimensions} assessments={assessments ?? []} />
        <Card padding="sm">
          <h3 className="font-semibold mb-3">Attendance</h3>
          {markedLessons === 0 ? (
            <p className="text-sm text-muted">
              No attendance marked yet. Record it on the{" "}
              <Link href="/schedule" className="text-primary hover:underline">Schedule</Link> page.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg bg-surface-dim/60 p-3">
                  <div className="text-xs text-muted">Attended</div>
                  <div className="text-xl font-bold text-success">{attendanceCounts.attended ?? 0} / {markedLessons}</div>
                </div>
                <div className="rounded-lg bg-surface-dim/60 p-3">
                  <div className="text-xs text-muted">Attendance rate</div>
                  <div className="text-xl font-bold">{attendanceRate === null ? "—" : `${attendanceRate}%`}</div>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                {([["student_cancel","Student cancellations"],["teacher_cancel","Teacher cancellations"],["no_show","No-shows"]] as const).map(([key,label]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted">{label}</span><span>{attendanceCounts[key] ?? 0}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
      <ChessLearningPanel fixedStudentId={id} />
    </div>
  );
}
