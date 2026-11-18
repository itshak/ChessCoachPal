"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {LocalizedUiError} from "@/i18n/api-error";
import {useTranslations} from "next-intl";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  EventForm,
  type EventFormStudent,
  type EventFormWorkplace,
  type EventFormValues,
} from "@/components/teacher/events/EventForm";
import { fromDatetimeLocalValue } from "@/lib/events";

export function NewEventForm({
  students,
  workplaces,
  initialStartsAt,
}: {
  students: EventFormStudent[];
  workplaces:EventFormWorkplace[];
  initialStartsAt: string;
}) {
  const router = useRouter();
  const t=useTranslations("newEventPage");
  const toUserError=useLocalizedApiError();

  async function handleSubmit(values: EventFormValues) {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description || undefined,
        location: values.location || undefined,
        startsAt: fromDatetimeLocalValue(values.startsAt),
        endsAt: values.endsAt
          ? fromDatetimeLocalValue(values.endsAt)
          : undefined,
        sendReminder: values.sendReminder,
        workplaceId:values.workplaceId,
        studentIds: values.studentIds,
        repertoireByStudent: values.repertoireByStudent,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new LocalizedUiError(toUserError(data,t("submitFailed")));
    }
    router.push(`/events/${data.event.id}`);
    router.refresh();
  }

  return (
    <Card>
      <EventForm
        students={students}
        workplaces={workplaces}
        initial={{
          title: "",
          startsAt: initialStartsAt,
          endsAt: "",
          location: "",
          description: "",
          sendReminder: false,
          workplaceId:null,
          studentIds: [],
          repertoireByStudent: {},
        }}
        submitLabel={t("title")}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
