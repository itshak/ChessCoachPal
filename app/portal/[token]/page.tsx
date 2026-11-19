import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {headers} from "next/headers";
import {getLocale,getTranslations} from "next-intl/server";
import {createServiceClient} from "@/lib/supabase/server";
import {toLocalDateString,addDays} from "@/lib/schedule";
import {isAppLocale,languageDirection} from "@/i18n/locales";
import {formatMoney} from "@/lib/billing";
import {Card} from "@/components/ui/card";
import {BrandMark} from "@/components/brand/BrandMark";
import {LanguageSwitcher} from "@/components/locale/LanguageSwitcher";
import {PortalCancelButton} from "@/components/portal/PortalCancelButton";
import {PortalEventRsvp} from "@/components/portal/PortalEventRsvp";
import {resolvePortalContext,portalCalendarForContext,
  portalSharedNotesForContext,portalEventsForContext} from "@/lib/server/portal-scope-service";
import {portalScopedInvoices} from "@/lib/server/portal-finance-scope";
import {rejectIfTokenLookupsBlocked,recordTokenLookupFailure} from "@/lib/server/token-guard";

export const dynamic="force-dynamic";
export const revalidate=0;
export async function generateMetadata():Promise<Metadata>{
  const t=await getTranslations("portal");
  return {title:t("title"),robots:{index:false,follow:false}};
}

/**
 * ONLY explicit scoped contact/student/workplace grants can open this page.
 * Old household/guardian tokens never match the SHA-256 capability store.
 * No inherited Family Studio policies, implicit contact visibility, or
 * cross-workplace invoice totals are queried or rendered.
 */
export default async function PortalPage({params}:{params:Promise<{token:string}>}){
  // Apply the same failed-token brute-force guard as the ICS and guest
  // mutation endpoints. Do not disclose whether a grant existed or expired.
  const request=new Request("https://portal.invalid/",{headers:await headers()});
  if(rejectIfTokenLookupsBlocked(request))notFound();
  const {token}=await params,db=createServiceClient();
  const ctx=await resolvePortalContext(db,token);
  if(!ctx){recordTokenLookupFailure(request);notFound();}
  const t=await getTranslations("portal"),locale=await getLocale();
  const timezone=ctx.workplace.timezone;
  const today=toLocalDateString(new Date(),timezone);
  const [calendar,invoices,events]=await Promise.all([
    portalCalendarForContext(db,ctx,addDays(today,-90),addDays(today,84)),
    portalScopedInvoices(db,ctx),
    portalEventsForContext(db,ctx),
  ]);
  const notes=await portalSharedNotesForContext(db,ctx,calendar);
  const upcoming=calendar.filter(s=>s.status!=="cancelled"&&
    s.starts_at>=new Date().toISOString()).slice(0,40);
  const dateTime=(time:string)=>new Intl.DateTimeFormat(locale,{
    dateStyle:"medium",timeStyle:"short",timeZone:timezone,
  }).format(new Date(time));
  const calendarPath=`/api/portal/${encodeURIComponent(token)}/calendar`;
  return (
    <div className="min-h-screen bg-background" dir={languageDirection(isAppLocale(locale)?locale:"en")}>
      <header className="bg-surface border-b border-border">
        <div className="max-w-3xl mx-auto px-4 min-h-14 py-2 flex flex-wrap items-center gap-2">
          <BrandMark size={28} className="h-7 w-7" />
          <span className="text-lg font-semibold text-primary tracking-tight">
            <bdi dir="auto">{ctx.workplace.name}</bdi>
          </span>
          <span className="text-muted text-sm ms-2">{t("title")}</span>
          <div className="ms-auto"><LanguageSwitcher compact /></div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section>
          <h1 className="text-2xl font-bold">{t("welcome",{name:ctx.contact.displayName})}</h1>
          <p className="text-muted text-sm mt-1">{t("scopedIntro")}</p>
          <p className="text-muted text-xs mt-2" dir="auto">
            {ctx.student.name} · {ctx.workplace.name}
          </p>
        </section>
        {ctx.grant.permissions.has("event_rsvp")&&events.length>0&&(
          <section>
            <h2 className="text-lg font-semibold mb-3">{t("events")}</h2>
            <div className="space-y-2">{events.map(event=><Card key={event.id} padding="sm">
              <p className="font-medium" dir="auto">{event.title}</p>
              <p className="text-muted text-sm">{dateTime(event.startsAt)}</p>
              {event.location&&<p className="text-muted text-xs" dir="auto">{event.location}</p>}
              {event.description&&<p className="text-sm whitespace-pre-wrap mt-2" dir="auto">{event.description}</p>}
              <PortalEventRsvp token={token} eventId={event.id}
                initialStatus={event.rsvp.status}
                initialPartySize={event.rsvp.partySize}
                initialNote={event.rsvp.note}/>
            </Card>)}</div>
          </section>
        )}
        {ctx.grant.permissions.has("calendar")&&(
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-semibold">{t("upcoming")}</h2>
              <a href={calendarPath} download
                className="border border-border rounded-lg px-3 py-1.5 text-xs font-semibold hover:border-primary/50">
                {t("calendarDownload")}
              </a>
            </div>
            {upcoming.length===0?<Card className="text-center text-muted">{t("noneLessons")}</Card>:
              <div className="space-y-2">{upcoming.map(session=>{
                const person=session.participants[0];
                const cancelled=["teacher_cancelled","student_cancelled"].includes(
                  person.attendanceStatus??"");
                return <Card key={session.id} padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{dateTime(session.starts_at)}</p>
                      <p className="text-muted text-xs">{t("shortMinutes",{count:session.duration_minutes})}</p>
                      <p className="text-muted text-xs" dir="auto">{ctx.student.name}</p>
                    </div>
                    {cancelled?<span className="text-xs text-muted">{t("cancelledStudent")}</span>:
                      ctx.grant.permissions.has("cancel")&&session.status==="scheduled"&&
                      !person.attendanceStatus?<PortalCancelButton token={token}
                        lessonId={session.id} studentId={ctx.grant.studentId}
                        windowHours={ctx.workplace.cancellationWindowHours}/>:null}
                  </div>
                </Card>;
              })}</div>}
            <p className="text-muted text-xs mt-2">{t("calendarHelp")}</p>
          </section>
        )}
        {ctx.grant.permissions.has("shared_notes")&&(
          <section>
            <h2 className="text-lg font-semibold mb-3">{t("teacherNotes")}</h2>
            {notes.length===0?<Card className="text-center text-muted">{t("noneNotes")}</Card>:
              <div className="space-y-2">{notes.map(note=><Card key={note.id} padding="sm">
                <p className="text-muted text-xs mb-1">{note.date}</p>
                <p className="text-sm whitespace-pre-wrap" dir="auto">{note.body}</p>
              </Card>)}</div>}
          </section>
        )}
        {ctx.grant.permissions.has("finance")&&(
          <section>
            <h2 className="text-lg font-semibold mb-3">{t("invoices")}</h2>
            {invoices.length===0?<Card className="text-center text-muted">{t("noneInvoices")}</Card>:
              <div className="space-y-2">{invoices.map(invoice=>{
                const due=Math.max(0,invoice.subtotalCents-invoice.paidCents);
                return <Card key={invoice.id} padding="sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{invoice.periodStart} – {invoice.periodEnd}</p>
                      <p className="text-muted text-sm">
                        {invoice.status==="paid"?t("paid"):t("sent")} · {formatMoney(invoice.subtotalCents,invoice.currency,locale)}
                      </p>
                      {invoice.paidCents>0&&due>0&&<p className="text-xs">
                        {t("paidAmount",{amount:formatMoney(invoice.paidCents,invoice.currency,locale)})} ·{" "}
                        {t("dueAmount",{amount:formatMoney(due,invoice.currency,locale)})}
                      </p>}
                    </div>
                    {invoice.status==="sent"&&due>0&&invoice.checkoutUrl&&
                      <a href={invoice.checkoutUrl} target="_blank" rel="noreferrer"
                        className="bg-primary text-white rounded-lg px-3 py-2 text-sm font-semibold">
                        {t("payOnline")}
                      </a>}
                  </div>
                </Card>;
              })}</div>}
          </section>
        )}
      </main>
    </div>
  );
}
