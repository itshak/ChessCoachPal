"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {EventPortalInvitationPanel} from "@/components/teacher/events/EventPortalInvitationPanel";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  EventForm,
  type EventFormStudent,
  type EventFormWorkplace,
  type EventFormValues,
} from "@/components/teacher/events/EventForm";
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/events";
import type { RsvpStatus } from "@/lib/supabase/types";



export function EventDetailClient({
  eventId,
  title,
  description,
  location,
  startsAt,
  endsAt,
  sendReminder,
  reminderSentAt,
  workplaceId,
  workplaces,
  students,
  allStudents,
  rsvps,
}: {
  eventId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  sendReminder: boolean;
  reminderSentAt: string | null;
  workplaceId:string|null;
  workplaces:EventFormWorkplace[];
  students: {
    studentId: string;
    name: string;
    repertoire: string;
  }[];
  allStudents: EventFormStudent[];
  rsvps: {
    id: string;
    guardianName: string;
    status: RsvpStatus;
    partySize: number | null;
    note: string;
  }[];
}) {
  const t=useTranslations("eventDetail");
  const toUserError=useLocalizedApiError();
  const router = useRouter();
  const { showToast } = useToast();
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initial: EventFormValues = {
    title,
    startsAt: toDatetimeLocalValue(startsAt),
    endsAt: endsAt ? toDatetimeLocalValue(endsAt) : "",
    location,
    description,
    sendReminder,
    workplaceId,
    studentIds: students.map((s) => s.studentId),
    repertoireByStudent: Object.fromEntries(
      students.map((s) => [s.studentId, s.repertoire])
    ),
  };

  async function handleSave(values: EventFormValues) {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        location: values.location,
        startsAt: fromDatetimeLocalValue(values.startsAt),
        endsAt: values.endsAt
          ? fromDatetimeLocalValue(values.endsAt)
          : null,
        sendReminder: values.sendReminder,
        workplaceId:values.workplaceId,
        studentIds: values.studentIds,
        repertoireByStudent: values.repertoireByStudent,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(toUserError(data, t("saveFailed")));
    }
    router.refresh();
  }

  async function handleEmail() {
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      const res = await fetch(`/api/events/${eventId}/email`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEmailMessage(toUserError(data, t("sendFailed")));
        return;
      }
      setEmailMessage(
        t("sentToFamilies",{count:data.sent,skipped:data.skipped?t("skipped",{count:data.skipped}):""})
      );
      router.refresh();
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        showToast(err?.error??t("deleteFailed"), "error");
        setDeleting(false);
        return;
      }
      router.push("/events");
      router.refresh();
    } catch {
      showToast(t("deleteFailed"),"error");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold"><bdi dir="auto">{title}</bdi></h1>
          <p className="text-muted text-sm mt-1">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleEmail}
            disabled={emailBusy || rsvps.length === 0}
          >
            {emailBusy?t("sending"):t("emailFamilies")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error hover:bg-error/10 hover:text-error"
            onClick={() => setConfirmDelete(true)}
          >
            {t("delete")}
          </Button>
        </div>
      </div>

      {emailMessage && (
        <p className="text-sm text-muted">{emailMessage}</p>
      )}

      <Card>
        <h2 className="font-semibold mb-4">{t("eventDetails")}</h2>
        <EventForm
          key={`${eventId}-${startsAt}-${sendReminder}-${reminderSentAt ?? ""}-${students.map((s) => s.studentId).join(",")}`}
          students={allStudents}
          workplaces={workplaces}
          initial={initial}
          submitLabel={t("saveChanges")}
          onSubmit={handleSave}
          reminderSentAt={reminderSentAt}
        />
      </Card>

      <EventPortalInvitationPanel eventId={eventId} workplaceId={workplaceId}
        studentIds={students.map(s=>s.studentId)}/>

      <Card>
        <h2 className="font-semibold mb-3">{t("rsvps")}</h2>
        {rsvps.length === 0 ? (
          <p className="text-sm text-muted">
            {t("noFamilies")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-muted border-b border-border">
                  <th className="py-2 pe-3 font-medium">{t("family")}</th>
                  <th className="py-2 pe-3 font-medium">{t("status")}</th>
                  <th className="py-2 pe-3 font-medium">{t("partySize")}</th>
                  <th className="py-2 font-medium">{t("note")}</th>
                </tr>
              </thead>
              <tbody>
                {rsvps.map((rsvp) => (
                  <tr key={rsvp.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pe-3 font-medium"><bdi dir="auto">{rsvp.guardianName}</bdi></td>
                    <td className="py-2.5 pe-3">
                      {rsvp.status==="pending"?t("pending"):rsvp.status==="yes"?t("yes"):rsvp.status==="no"?t("no"):t("maybe")}
                    </td>
                    <td className="py-2.5 pe-3 tabular-nums">
                      {rsvp.partySize ?? "—"}
                    </td>
                    <td className="py-2.5 text-muted">
                      {rsvp.note?.trim() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="bg-surface border border-border rounded-xl shadow-lg max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg mb-1">{t("deleteTitle")}</h3>
            <p className="text-muted text-sm mb-4">
              {t("deleteWarning",{title})}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="error"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting?t("deleting"):t("delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
