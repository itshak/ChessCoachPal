import type {Metadata} from "next";
import {getLocale,getTranslations} from "next-intl/server";
import {useTranslations} from "next-intl";
import type {AppLocale} from "@/i18n/locales";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { getPolicy } from "@/lib/server/scheduling";
import { materializeCanonicalSessions } from "@/lib/server/canonical-calendar-service";
import { canonicalCalendarWindow } from "@/lib/server/canonical-calendar-read";
import {
  addDays,
  toLocalDateString,
  formatLessonTime,
  formatLessonDate,
  formatShortDate,
  oneToOne,
} from "@/lib/schedule";
import type { RsvpStatus } from "@/lib/supabase/types";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/brand/BrandMark";
import {LanguageSwitcher} from "@/components/locale/LanguageSwitcher";
import { familyDisplayName } from "@/lib/guardians";
import {
  formatCalendarDate,
  formatMoney,
  summarizePayments,
} from "@/lib/billing";
import { describeCreditPackage } from "@/lib/credits";
import {
  loadCanonicalCreditBalances,
  type CanonicalPackageWithBalance,
} from "@/lib/server/canonical-credits";
import { isValidPaymentQrDataUrl } from "@/lib/payment-qr";
import { formatEventWhen } from "@/lib/events";
import { PortalCancelButton } from "@/components/portal/PortalCancelButton";
import { PortalEventRsvp } from "@/components/portal/PortalEventRsvp";
import { PortalPolicyBanner } from "@/components/portal/PortalPolicyBanner";
import { StudioPoliciesSection } from "@/components/portal/StudioPoliciesSection";

export async function generateMetadata():Promise<Metadata>{
  const t=await getTranslations("portal");return {title:t("title")};
}

type PortalAttendanceStatus =
  "present"|"late"|"absent"|"excused"|"student_cancelled"|"teacher_cancelled";
interface PortalLesson {
  id:string;student_id:string;lesson_date:string;
  starts_at:string;duration_minutes:number;makeup_for_session_id:string|null;
  attendance:{status:PortalAttendanceStatus}|null;
}

function lessonIsUpcoming(
  lesson: PortalLesson,
  status: PortalAttendanceStatus | undefined,
  cancelled: boolean
) {
  return (
    !cancelled &&
    status !== "present" &&
    status !== "late" && status !== "absent" &&
    new Date(lesson.starts_at).getTime() > Date.now()
  );
}

function PortalLessonCard({
  lesson,
  timezone,
  token,
  windowHours,
  locale,
}: {
  lesson: PortalLesson;
  timezone: string;
  token: string;
  windowHours: number;
  locale: AppLocale;
}) {
  const t=useTranslations("portal");
  const status = oneToOne(lesson.attendance)?.status;
  const cancelled = status === "teacher_cancelled" || status === "student_cancelled";
  const upcoming = lessonIsUpcoming(lesson, status, cancelled);

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className={`font-medium ${cancelled ? "line-through text-muted" : ""}`}>
            {locale==="en"?formatLessonDate(lesson.starts_at,timezone):
              new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:timezone})
                .format(new Date(lesson.starts_at))} ·{" "}
            {locale==="en"?formatLessonTime(lesson.starts_at,timezone):
              new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:timezone})
                .format(new Date(lesson.starts_at))}
          </div>
          <div className="text-xs text-muted">
            {t("shortMinutes",{count:lesson.duration_minutes})}
            {lesson.makeup_for_session_id && " · "+t("makeup")}
          </div>
        </div>
        {cancelled && status && (
          <span className="text-xs text-error font-medium">
            {status==="student_cancelled"?t("cancelledStudent"):t("cancelledTeacher")}
          </span>
        )}
        {upcoming && (
          <PortalCancelButton
            token={token}
            lessonId={lesson.id}
            studentId={lesson.student_id}
            windowHours={windowHours}
          />
        )}
      </div>
    </Card>
  );
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t=await getTranslations("portal"),locale=await getLocale();
  const supabase = createServiceClient();

  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, name, family_name, teacher_id, students ( id, name )")
    .eq("portal_token", token)
    .single();

  if (!guardian) notFound();

  const students = (guardian.students ?? []) as { id: string; name: string }[];
  const studentIds = students.map((s) => s.id);

  const policy = await getPolicy(supabase, guardian.teacher_id);
  const today = toLocalDateString(new Date(), policy.timezone);

  let lessons: PortalLesson[] = [];
  let sharedNotes: {
    id: string;
    body: string;
    lessons: { lesson_date: string; student_id: string } | null;
  }[] = [];
  let invoices: {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    subtotal_cents: number;
    currency: string;
    stripe_checkout_url: string | null;
    payments: { amount_cents: number }[] | null;
  }[] = [];
  let portalEvents: {
    id: string;
    title: string;
    description: string;
    location: string;
    starts_at: string;
    ends_at: string | null;
    performers: { name: string; repertoire: string }[];
    rsvp: {
      id: string;
      status: RsvpStatus;
      party_size: number | null;
      note: string;
    } | null;
  }[] = [];
  let creditPackages: CanonicalPackageWithBalance[] = [];

  const invoicesRes = await supabase
    .from("invoices")
    .select(
      "id, period_start, period_end, status, subtotal_cents, currency, stripe_checkout_url, payments ( amount_cents )"
    )
    .eq("guardian_id", guardian.id)
    .in("status", ["sent", "paid"])
    .not("sent_at", "is", null)
    .order("period_end", { ascending: false })
    .limit(12);
  invoices = (invoicesRes.data ?? []) as typeof invoices;
  // Rendered once below the invoice list, only while something is owed
  // without an online pay link.
  const paymentQrCode =
    policy.payment_provider === "manual" &&
    isValidPaymentQrDataUrl(policy.payment_qr_code) &&
    invoices.some((inv) => inv.status === "sent" && !inv.stripe_checkout_url)
      ? policy.payment_qr_code
      : null;

  if (studentIds.length > 0) {
    await materializeCanonicalSessions(supabase,guardian.teacher_id,today,
      addDays(today,28),{trustedServiceRole:true});
    const [sessionRows,eventsRes]=await Promise.all([
      canonicalCalendarWindow(supabase,guardian.teacher_id,today,
        addDays(today,28),policy.timezone,studentIds),
      supabase.from("events").select(
        `id,title,description,location,starts_at,ends_at,
         event_students!inner(student_id,repertoire,sort_order,students(id,name)),
         event_rsvps(id,status,party_size,note,guardian_id)`
      ).eq("teacher_id",guardian.teacher_id)
       .gte("starts_at",new Date().toISOString())
       .in("event_students.student_id",studentIds).order("starts_at"),
    ]);
    lessons=sessionRows.flatMap(session=>session.participants.map(person=>({
      id:session.id,student_id:person.studentId,
      lesson_date:toLocalDateString(new Date(session.starts_at),
        session.local_timezone||policy.timezone),
      starts_at:session.starts_at,duration_minutes:session.duration_minutes,
      makeup_for_session_id:session.makeup_for_session_id,
      attendance:person.attendanceStatus?
        {status:person.attendanceStatus as PortalAttendanceStatus}:null,
    })));
    const visibleSessions=[...new Set(sessionRows.map(s=>s.id))];
    if(visibleSessions.length){
      const noteRows:{id:string;body:string;session_id:string;student_id:string|null}[]=[];
      for(let i=0;i<visibleSessions.length;i+=75){
        const {data,error}=await supabase.from("session_notes")
          .select("id,body,session_id,student_id").eq("teacher_id",guardian.teacher_id)
          .eq("shared_with_guardian",true)
          .in("session_id",visibleSessions.slice(i,i+75))
          .order("updated_at",{ascending:false}).limit(100);
        if(error)throw new Error("Family lesson notes unavailable");
        noteRows.push(...(data??[]));
      }
      const visibleIds=new Set(studentIds);
      const sessionsById=new Map(sessionRows.map(row=>[row.id,row]));
      sharedNotes=noteRows.filter(note=>note.student_id===null||
          visibleIds.has(note.student_id))
        .map(note=>{
          const session=sessionsById.get(note.session_id)!;
          const person=note.student_id?
            session.participants.find(x=>x.studentId===note.student_id):
            session.participants[0];
          return {id:note.id,body:note.body,lessons:person?{
            lesson_date:toLocalDateString(new Date(session.starts_at),
              session.local_timezone||policy.timezone),
            student_id:person.studentId,
          }:null};
        }).slice(0,6);
    }

    const studentIdSet = new Set(studentIds);
    portalEvents = ((eventsRes.data ?? []) as {
      id: string;
      title: string;
      description: string;
      location: string;
      starts_at: string;
      ends_at: string | null;
      event_students:
        | {
            student_id: string;
            repertoire: string;
            sort_order: number;
            students: { id: string; name: string } | { id: string; name: string }[] | null;
          }[]
        | null;
      event_rsvps:
        | {
            id: string;
            status: RsvpStatus;
            party_size: number | null;
            note: string;
            guardian_id: string;
          }[]
        | null;
    }[])
      .map((event) => {
        const performers = (event.event_students ?? [])
          .filter((es) => studentIdSet.has(es.student_id))
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((es) => {
            const student = oneToOne(es.students);
            return {
              name: student?.name ?? "Student",
              repertoire: es.repertoire?.trim() ?? "",
            };
          });
        const rsvp =
          (event.event_rsvps ?? []).find((r) => r.guardian_id === guardian.id) ??
          null;
        return {
          id: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          performers,
          rsvp: rsvp
            ? {
                id: rsvp.id,
                status: rsvp.status,
                party_size: rsvp.party_size,
                note: rsvp.note,
              }
            : null,
        };
      })
      .filter((e) => e.performers.length > 0);

    // Only packages the family can still use; used-up and expired ones drop off.
    creditPackages = (
      await loadCanonicalCreditBalances(
        supabase,
        guardian.teacher_id,
        policy,
        studentIds,
        today
      )
    ).filter((pkg) => pkg.balance.state === "active");


  }

  const nameById = new Map(students.map((s) => [s.id, s.name]));
  const calendarPath = `/api/portal/${token}/calendar`;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border">
        <div className="max-w-3xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2">
          <BrandMark size={28} className="h-7 w-7" />
          <span className="text-lg font-bold text-primary tracking-tight">
            {policy.studio_name || "ChessCoachPal"}
          </span>
          <span className="text-muted text-sm ms-2">{t("title")}</span>
          <div className="ms-auto"><LanguageSwitcher compact /></div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {policy.policies_updated_at && (
          <PortalPolicyBanner
            token={token}
            policiesUpdatedAt={policy.policies_updated_at}
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {t("welcome",{name:familyDisplayName(guardian)})}
          </h1>
          <p className="text-muted text-sm mt-1">
            {t("intro")}
          </p>
        </div>

        {/* Events */}
        {portalEvents.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">{t("events")}</h2>
            <div className="space-y-2">
              {portalEvents.map((event) => (
                <Card key={event.id} padding="sm">
                  <div className="font-medium"><bdi dir="auto">{event.title}</bdi></div>
                  <div className="text-sm text-muted mt-0.5">
                    {formatEventWhen(event.starts_at,event.ends_at,policy.timezone,locale)}
                  </div>
                  {event.location?.trim() && (
                    <div className="text-xs text-muted mt-0.5">
                      <bdi dir="auto">{event.location.trim()}</bdi>
                    </div>
                  )}
                  {event.performers.length > 0 && (
                    <ul className="mt-2 text-sm space-y-0.5">
                      {event.performers.map((p, i) => (
                        <li key={`${p.name}-${i}`}>
                          {p.repertoire
                            ? `${p.name} — ${p.repertoire}`
                            : p.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {event.description?.trim() && (
                    <p className="text-xs text-muted mt-2 whitespace-pre-wrap" dir="auto">
                      {event.description.trim()}
                    </p>
                  )}
                  {event.rsvp && (
                    <PortalEventRsvp
                      token={token}
                      eventId={event.id}
                      initialStatus={event.rsvp.status}
                      initialPartySize={event.rsvp.party_size}
                      initialNote={event.rsvp.note}
                    />
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming lessons */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{t("upcoming")}</h2>
            <a
              href={calendarPath}
              download
              className="inline-flex items-center justify-center font-semibold bg-surface border border-border text-foreground hover:border-primary/50 px-3 py-1.5 text-xs rounded-lg transition-colors"
            >
              {t("calendarDownload")}
            </a>
          </div>
          {lessons.length === 0 ? (
            <Card className="text-center text-muted">{t("noneLessons")}</Card>
          ) : students.length > 1 ? (
            <div className="space-y-5">
              {students.map((student) => {
                const studentLessons = lessons.filter(
                  (lesson) => lesson.student_id === student.id
                );
                if (studentLessons.length === 0) return null;
                return (
                  <div key={student.id}>
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                      <bdi dir="auto">{student.name}</bdi>
                    </h3>
                    <div className="space-y-2">
                      {studentLessons.map((lesson) => (
                        <PortalLessonCard
                          key={lesson.id}
                          lesson={lesson}
                          timezone={policy.timezone}
                          token={token}
                          windowHours={policy.cancellation_window_hours}
                          locale={locale}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <PortalLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  timezone={policy.timezone}
                  token={token}
                  windowHours={policy.cancellation_window_hours}
                  locale={locale}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted mt-2">
            {t("calendarHelp")}
          </p>
        </section>

        {/* Lesson notes from the teacher */}
        <section>
          <h2 className="text-lg font-semibold mb-3">{t("teacherNotes")}</h2>
          {sharedNotes.length === 0 ? (
            <Card className="text-center text-muted">{t("noneNotes")}</Card>
          ) : (
            <div className="space-y-2">
              {sharedNotes.map((note) => (
                <Card key={note.id} padding="sm">
                  <div className="text-xs text-muted mb-1">
                    {note.lessons
                      ? `${nameById.get(note.lessons.student_id) ?? "Student"} · ${formatShortDate(
                          `${note.lessons.lesson_date}T12:00:00Z`,
                          "UTC"
                        )}`
                      : ""}
                  </div>
                  <p className="text-sm whitespace-pre-wrap" dir="auto">{note.body}</p>
                </Card>
              ))}
            </div>
          )}
        </section>

        {creditPackages.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">{t("prepaid")}</h2>
            <div className="space-y-2">
              {creditPackages.map((pkg) => (
                <Card key={pkg.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {students.length > 1 &&
                          `${nameById.get(pkg.studentId) ?? "Student"} · `}
                        {locale==="en"?describeCreditPackage(pkg.credits,pkg.durationMinutes):
                          t("creditPackage",{count:pkg.credits,minutes:pkg.durationMinutes})}
                      </div>
                      <div className="text-xs text-muted">
                        {pkg.expiresOn
                          ? t("creditExpiry",{date:locale==="en"?formatCalendarDate(pkg.expiresOn):
                              new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"})
                                .format(new Date(pkg.expiresOn+"T12:00:00Z"))})
                          : t("noExpiry")}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-lg font-bold tabular-nums">
                        {pkg.balance.remainingCredits}
                        <span className="text-sm font-normal text-muted">
                          {" "}
                          {t("creditsTotal",{count:pkg.credits})}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted mt-2">
              {t("creditHelp")}
            </p>
          </section>
        )}

        {/* Invoices */}
        <section>
          <h2 className="text-lg font-semibold mb-3">{t("invoices")}</h2>
          {invoices.length === 0 ? (
            <Card className="text-center text-muted">{t("noneInvoices")}</Card>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <Card key={inv.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {inv.period_start} → {inv.period_end}
                      </div>
                      <div className="text-xs text-muted capitalize">
                        {inv.status==="paid"?t("paid"):t("sent")} · {formatMoney(inv.subtotal_cents, inv.currency)}
                      </div>
                      {(() => {
                        if (inv.status !== "sent") return null;
                        const { paidCents, balanceCents } = summarizePayments(
                          inv.subtotal_cents,
                          (inv.payments ?? []).map((p) => ({
                            amountCents: p.amount_cents,
                          }))
                        );
                        if (paidCents <= 0 || balanceCents <= 0) return null;
                        return (
                          <div className="text-xs font-semibold">
                            {t("paidAmount",{amount:formatMoney(paidCents, inv.currency)})} ·{" "}
                            {t("dueAmount",{amount:formatMoney(balanceCents, inv.currency)})}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {inv.status === "sent" && inv.stripe_checkout_url && (
                        <a
                          href={inv.stripe_checkout_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center font-semibold bg-primary text-white hover:bg-primary-dark px-4 py-2 text-sm rounded-lg transition-colors"
                        >
                          {t("payOnline")}
                        </a>
                      )}
                      {inv.status === "sent" &&
                        !inv.stripe_checkout_url &&
                        policy.payment_instructions.trim() && (
                          <p className="text-xs text-muted whitespace-pre-wrap text-end max-w-xs">
                            {policy.payment_instructions}
                          </p>
                        )}
                      {inv.status === "paid" && (
                        <span className="text-xs font-semibold text-primary">
                          {t("paid")}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {paymentQrCode && (
            <Card padding="sm" className="mt-2 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={paymentQrCode}
                alt={t("paymentQr")}
                className="h-36 w-36 shrink-0 rounded-lg border border-border bg-white object-contain p-1"
              />
              <div className="text-sm">
                <div className="font-medium">{t("scanToPay")}</div>
                <p className="text-xs text-muted">
                  {t("scanHint")}
                </p>
              </div>
            </Card>
          )}
        </section>

        {/* Studio policies (read-only summary) */}
        <StudioPoliciesSection policy={policy} />

        {/* Studio info */}
        {(policy.studio_info || policy.studio_website || policy.studio_contact) && (
          <section>
            <h2 className="text-lg font-semibold mb-3">
              {t("about",{name:policy.studio_name||t("studioFallback")})}
            </h2>
            <Card padding="sm">
              {policy.studio_info && (
                <p className="text-sm whitespace-pre-wrap mb-3" dir="auto">
                  {policy.studio_info}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                {policy.studio_website && (
                  <a
                    href={policy.studio_website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary font-medium hover:underline"
                  >
                    {t("visitWebsite")}
                  </a>
                )}
                {policy.studio_contact && (
                  <span className="text-muted">{policy.studio_contact}</span>
                )}
              </div>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
