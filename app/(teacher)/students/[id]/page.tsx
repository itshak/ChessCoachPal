import type { Metadata } from "next";
import {getTranslations} from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {LearnerReportPreviewPanel} from "@/components/teacher/LearnerReportPreviewPanel";
import {LearnerEvidencePanel} from "@/components/teacher/LearnerEvidencePanel";
import {learnerEvidenceSchema,teacherLearnerEvidence} from "@/lib/server/learner-evidence";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";
import { StudentTrainingPlansPanel } from "@/components/teacher/StudentTrainingPlansPanel";
import { ArchiveStudentButton } from "@/components/teacher/ArchiveStudentButton";
import { RemoveStudentButton } from "@/components/teacher/RemoveStudentButton";
import { StudentNotesEditor } from "@/components/teacher/StudentNotesEditor";
import { StudentLessonNotes } from "@/components/teacher/StudentLessonNotes";
import { StudentInfoCard } from "@/components/teacher/StudentInfoCard";
import { StudentChessProfileEditor } from "@/components/teacher/StudentChessProfileEditor";
import { StudentContactsPanel } from "@/components/teacher/StudentContactsPanel";
import {StudentBillingAssignmentsPanel} from "@/components/teacher/StudentBillingAssignmentsPanel";
import {StudentPortalSharingPanel} from "@/components/teacher/StudentPortalSharingPanel";
import { StudentRatingHistoryPanel } from "@/components/teacher/StudentRatingHistoryPanel";
import { StudentFederationsPanel } from "@/components/teacher/StudentFederationsPanel";
import { UnifiedLessonHistoryPanel } from "@/components/teacher/UnifiedLessonHistoryPanel";
import { CoachBriefingPanel } from "@/components/teacher/CoachBriefingPanel";
import { EditableStudentName } from "@/components/teacher/EditableStudentName";
import { SkillsPanel } from "@/components/teacher/skills/SkillsPanel";
import { CreditPackagesCard } from "@/components/teacher/billing/CreditPackagesCard";
import { getOrSeedDimensions } from "@/lib/server/skills";
import { getPolicy } from "@/lib/server/scheduling";
import {loadCanonicalCreditBalances} from "@/lib/server/canonical-credits";
import {withCreditFundingReport} from "@/lib/server/credit-package-funding";
import { oneToOne, toLocalDateString } from "@/lib/schedule";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t=await getTranslations("studentDetail");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { title: t("student") };
  const { data } = await supabase.from("students").select("name").eq("id", id).eq("teacher_id", user.id).maybeSingle();
  return { title: data?.name ?? t("student") };
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t=await getTranslations("studentDetail");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: student },
    dimensions,
    { data: assessments },
    learnerEvidence,
    { data: lessonNoteRows },
    policy,
  ] = await Promise.all([
    supabase.from("students").select("*")
      .eq("id", id).eq("teacher_id", user.id).single(),
    getOrSeedDimensions(supabase, user.id),
    supabase.from("skill_assessments").select("id, dimension_id, rating, assessed_on, created_at")
      .eq("student_id", id).order("assessed_on").order("created_at"),
    learnerEvidenceSchema.safeParse({studentId:id}).success
      ? teacherLearnerEvidence(supabase,user.id,{studentId:id}).catch(()=>null) : Promise.resolve(null),
    supabase.from("session_notes").select(
      "id,body,private_body,shared_with_contacts,emailed_at,updated_at,teaching_sessions!session_notes_session_teacher_fkey(starts_at,local_timezone)"
    ).eq("teacher_id",user.id).eq("student_id",id)
     .order("updated_at",{ascending:false}).limit(100),
    getPolicy(supabase, user.id),
  ]);
  if (!student) notFound();

  const lessonNotes=(lessonNoteRows??[]).flatMap(row=>{
    const session=oneToOne(row.teaching_sessions as
      {starts_at:string;local_timezone:string|null}|
      {starts_at:string;local_timezone:string|null}[]|null);
    if(!session||!(row.body?.trim()||row.private_body?.trim()))return [];
    return [{
      id:row.id,body:row.body??"",privateBody:row.private_body??"",
      sharedWithContacts:row.shared_with_contacts,emailedAt:row.emailed_at,
      lessonDate:toLocalDateString(new Date(session.starts_at),
        session.local_timezone||policy.timezone),
      updatedAt:row.updated_at,
    }];
  });

  const [creditPackages, { data: activeSlot }] = await Promise.all([
    loadCanonicalCreditBalances(supabase,user.id,policy,[id],toLocalDateString(new Date(),policy.timezone),{includeClosed:true})
      .then(packages=>withCreditFundingReport(supabase,packages)),
    supabase.from("lesson_slots").select("duration_minutes, rate_cents")
      .eq("student_id", id).eq("active", true).order("start_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const today=toLocalDateString(new Date(),policy.timezone);
  const [{data:enrollmentRows},{data:workplaceRows}]=await Promise.all([
    supabase.from("workplace_enrollments").select("workplace_id")
      .eq("teacher_id",user.id).eq("student_id",id)
      .is("cancelled_at",null)
      .or(`starts_on.is.null,starts_on.lte.${today}`)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
    supabase.from("workplaces").select("id,name").eq("teacher_id",user.id).order("name"),
  ]);
  const enrolledIds=new Set((enrollmentRows??[]).map(x=>x.workplace_id));
  const sharingWorkplaces=(workplaceRows??[]).filter(w=>enrolledIds.has(w.id));
  // The UI can offer purchase only with a dated, explicitly attested payer.
  // Database RPC independently rechecks workplace, payer, and date atomically.
  const {data:payerAssignments,error:payerReadError}=await supabase
    .from("student_billing_assignments")
    .select("workplace_id,effective_from,effective_to")
    .eq("teacher_id",user.id).eq("student_id",id);
  const activePayers=new Set((payerAssignments??[])
    .filter(a=>a.effective_from<=today&&(a.effective_to===null||a.effective_to>=today))
    .map(a=>a.workplace_id));
  const creditWorkplaces=sharingWorkplaces.filter(w=>activePayers.has(w.id));

  return (
    <div>
      <Link href="/students" className="inline-block mb-6 text-muted hover:text-foreground"><span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>{" "}{t("back")}</Link>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <EditableStudentName studentId={id} initialName={student.name} />
          <a href="#student-contacts" className="text-sm text-primary hover:underline">
            {t("contacts")}
          </a>
          <a href="#learner-evidence" className="ms-4 text-sm text-primary hover:underline">
            {t("learnerEvidenceLink")}
          </a>
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
      <StudentContactsPanel studentId={id} />
      <StudentBillingAssignmentsPanel studentId={id} workplaces={sharingWorkplaces}/>
      <StudentPortalSharingPanel studentId={id} workplaces={sharingWorkplaces}/>
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
      <StudentRatingHistoryPanel studentId={id} />
      <StudentFederationsPanel studentId={id} />
      <CreditPackagesCard
        studentId={id}
        hasBillingAccount={!payerReadError&&creditWorkplaces.length>0}
        workplaces={creditWorkplaces}
        currency={policy.currency}
        packages={creditPackages.map(pkg => ({
          id: pkg.id, invoiceId: pkg.invoiceId, fundingReport:pkg.fundingReport,
          credits: pkg.credits, adjustmentCredits:pkg.adjustmentCredits??0,
          durationMinutes: pkg.durationMinutes,
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
      <StudentTrainingPlansPanel studentId={id} />
      <CoachBriefingPanel studentId={id} />
      <LearnerEvidencePanel evidence={learnerEvidence} />
      <LearnerReportPreviewPanel studentId={id} workplaces={workplaceRows??[]} />
      <div className="mb-8"><UnifiedLessonHistoryPanel fixedStudentId={id}/></div>
      <div className="mb-8"><MaterialHistoryPanel fixedStudentId={id} /></div>

      <h2 className="text-lg font-semibold mb-3">{t("progress")}</h2>
      <div className="mb-8">
        <SkillsPanel studentId={id} dimensions={dimensions} assessments={assessments ?? []} />
      </div>
      <ChessLearningPanel fixedStudentId={id} />
    </div>
  );
}
