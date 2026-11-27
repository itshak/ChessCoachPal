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
import { StudentAutomaticRatingsPanel } from "@/components/teacher/StudentAutomaticRatingsPanel";
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
import {StudentDirectory} from "../StudentDirectory";
import {NextStudentLesson} from "./NextStudentLesson";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const t=await getTranslations("studentDetail");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { title: t("student") };
  const { data } = await supabase.from("students").select("name").eq("id", id).eq("teacher_id", user.id).maybeSingle();
  return { title: data?.name ?? t("student") };
}

export default async function StudentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{show?:string;q?:string}> }) {
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
  const rosterParams=await searchParams;
  const directoryParams={show: rosterParams.show ?? (student.archived_at ? "archived" : undefined), q: typeof rosterParams.q==="string" ? rosterParams.q.slice(0,80) : undefined};
  const backQuery=new URLSearchParams();
  if(directoryParams.show==="archived")backQuery.set("show","archived");
  if(directoryParams.q)backQuery.set("q",directoryParams.q);
  const backHref="/students"+(backQuery.size?"?"+backQuery.toString():"")+"#student-row-"+id;
  const st=await getTranslations("students");
  const common=await getTranslations("common");
  const history=await getTranslations("lessonHistory");

  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2.3fr)]">
      <aside className="hidden min-w-0 md:block md:self-start md:sticky md:top-4 md:max-h-[85vh] md:overflow-y-auto" aria-label={st("title")}>
        <StudentDirectory searchParams={Promise.resolve(directoryParams)} selectedId={id}/>
      </aside>
      <article className="min-w-0 text-[15px] leading-relaxed">
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-2 mb-3 text-muted hover:text-foreground"><span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>{" "}{t("back")}</Link>
      <header className="rounded-xl border border-border bg-surface p-4 sm:p-5 mb-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <EditableStudentName studentId={id} initialName={student.name} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{student.archived_at?st("archived"):st("active")}</span>
            {student.level&&<bdi dir="auto">{student.level}</bdi>}
            {sharingWorkplaces.map(w=><bdi dir="auto" key={w.id}>{w.name}</bdi>)}
          </div>
          {Boolean(student.name_aliases?.length)&&<p className="text-sm text-muted mt-1 break-words"><bdi dir="auto">{student.name_aliases?.join(" · ")}</bdi></p>}
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

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-4">
        {[
          {label:st("teacherStrength"),value:student.strength==null?common("unknown"):`${student.strength}/10`},
          {label:st("lichessRating"),value:student.lichess_rating??common("unknown")},
          {label:st("chesscomRating"),value:student.chesscom_rating??common("unknown")},
        ].map(metric=><div key={metric.label} className="min-w-0 rounded-lg bg-background p-3"><dt className="text-sm text-muted">{metric.label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{metric.value}</dd></div>)}
      </dl>
      </header>
      <nav aria-label={st("profile")} className="flex flex-wrap gap-2 mb-5">
        {[["#student-learning",history("title")],["#student-ratings",st("chessProfile")],["#student-contacts",t("contacts")],["#student-progress",t("progress")]].map(([href,label])=><a key={href} href={href} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm text-primary">{label}</a>)}
      </nav>
      <section id="student-learning" className="scroll-mt-4 space-y-4 mb-6">
      {!student.archived_at&&<NextStudentLesson db={supabase} teacherId={user.id} studentId={id} timezone={policy.timezone}/>}
      <CoachBriefingPanel studentId={id} />
      <LearnerEvidencePanel evidence={learnerEvidence} />
      <UnifiedLessonHistoryPanel fixedStudentId={id}/>
      <MaterialHistoryPanel fixedStudentId={id}/>
      <StudentTrainingPlansPanel studentId={id} />
      <StudentLessonNotes notes={lessonNotes} timezone={policy.timezone} />
      <StudentNotesEditor key={(student.teacher_notes ?? "").length} studentId={id} initialNotes={student.teacher_notes ?? ""}/>
      </section>
      <section id="student-ratings" className="scroll-mt-4 space-y-3 mb-6">
      <StudentChessProfileEditor key={id}
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
      <StudentAutomaticRatingsPanel studentId={id} />
      <StudentRatingHistoryPanel studentId={id} />
      <StudentFederationsPanel studentId={id} />
      </section>
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
      <StudentPortalSharingPanel studentId={id} workplaces={sharingWorkplaces} timeZone={policy.timezone}/>
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

      <LearnerReportPreviewPanel studentId={id} workplaces={workplaceRows??[]} />

      <h2 id="student-progress" className="scroll-mt-4 text-lg font-semibold mb-3">{t("progress")}</h2>
      <div className="mb-8">
        <SkillsPanel studentId={id} dimensions={dimensions} assessments={assessments ?? []} />
      </div>
      <ChessLearningPanel fixedStudentId={id} />
      </article>
    </div>
  );
}
