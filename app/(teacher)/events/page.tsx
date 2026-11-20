import Link from "next/link";
import {getLocale,getTranslations} from "next-intl/server";
import {useTranslations} from "next-intl";
import { createClient } from "@/lib/supabase/server";
import { getPolicy } from "@/lib/server/scheduling";
import { formatEventWhen } from "@/lib/events";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RsvpStatus } from "@/lib/supabase/types";

export async function generateMetadata() {const t=await getTranslations("events");return {title:t("title")};}

interface EventListRow {
  id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  event_students: { id: string }[] | null;
  portal_event_invitations: { status: RsvpStatus;revoked_at:string|null }[] | null;
}

type EventRow = ReturnType<typeof buildEventRows>[number];

function buildEventRows(events: EventListRow[], timezone: string, locale:"en"|"he"|"ru") {
  const now = Date.now();
  return events.map((event) => {
    const rsvps = (event.portal_event_invitations ?? []).filter(r=>!r.revoked_at);
    return {
      id: event.id,
      title: event.title,
      location: event.location,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      when: formatEventWhen(event.starts_at, event.ends_at, timezone, locale),
      studentCount: event.event_students?.length ?? 0,
      rsvpYes: rsvps.filter((r) => r.status === "yes").length,
      rsvpPending: rsvps.filter((r) => r.status === "pending").length,
      isUpcoming: new Date(event.starts_at).getTime() >= now,
    };
  });
}

function EventList({ items, empty }: { items: EventRow[]; empty: string }) {
  const t=useTranslations("events");
  if (items.length === 0) {
    return <p className="text-sm text-muted py-2">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((event) => (
        <Link key={event.id} href={`/events/${event.id}`} className="block">
          <Card padding="sm" className="hover:border-primary/40 transition-colors">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate"><bdi dir="auto">{event.title}</bdi></div>
                <div className="text-sm text-muted mt-0.5">{event.when}</div>
                {event.location?.trim() ? (
                  <div className="text-sm text-muted mt-0.5">
                    <bdi dir="auto">{event.location}</bdi>
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-muted text-end shrink-0">
                <div>
                  {t("participants",{count:event.studentCount})}
                </div>
                <div className="mt-0.5">
                  {t("rsvp",{yes:event.rsvpYes,pending:event.rsvpPending})}
                </div>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default async function EventsPage() {
  const t=await getTranslations("events"),locale=await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const policy = await getPolicy(supabase, user.id);
  const { data: events } = await supabase
    .from("events")
    .select(
      `
      id, title, location, starts_at, ends_at,
      event_students ( id ),
      portal_event_invitations ( status, revoked_at )
    `
    )
    .eq("teacher_id", user.id)
    .order("starts_at", { ascending: false });

  const rows = buildEventRows(
    (events ?? []) as unknown as EventListRow[],
    policy.timezone,locale
  );

  const upcoming = rows.filter((r) => r.isUpcoming).reverse();
  const past = rows.filter((r) => !r.isUpcoming);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted text-sm mt-1">
            {t("intro")}
          </p>
        </div>
        <Link href="/events/new">
          <Button>{t("create")}</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card className="text-center text-muted">
          {t("none")}
        </Card>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
              {t("upcoming")}
            </h2>
            <EventList items={upcoming} empty={t("emptyUpcoming")} />
          </section>
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
              {t("past")}
            </h2>
            <EventList items={past} empty={t("emptyPast")} />
          </section>
        </div>
      )}
    </div>
  );
}
