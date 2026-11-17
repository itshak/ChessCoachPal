"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useMemo, useState } from "react";
import {useLocale,useTranslations} from "next-intl";
import { Button } from "@/components/ui/button";

const inputClass =
  "min-w-0 max-w-full w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

export type EventFormStudent = { id: string; name: string };

export type EventFormValues = {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  description: string;
  sendReminder: boolean;
  studentIds: string[];
  repertoireByStudent: Record<string, string>;
};

export function EventForm({
  students,
  initial,
  submitLabel,
  onSubmit,
  reminderSentAt = null,
}: {
  students: EventFormStudent[];
  initial: EventFormValues;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
  /** ISO timestamp when the day-before reminder was already sent (detail page). */
  reminderSentAt?: string | null;
}) {
  const t=useTranslations("eventForm"),locale=useLocale();
  const toUserError=useLocalizedApiError();
  const [title, setTitle] = useState(initial.title);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [endsAt, setEndsAt] = useState(initial.endsAt);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [sendReminder, setSendReminder] = useState(initial.sendReminder);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial.studentIds)
  );
  const [repertoire, setRepertoire] = useState<Record<string, string>>(
    () => ({ ...initial.repertoireByStudent })
  );
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredStudents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, filter]);

  function toggleStudent(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("titleRequired"));
      return;
    }
    if (!startsAt) {
      setError(t("startRequired"));
      return;
    }
    if (endsAt) {
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
        setError(t("endAfterStart"));
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const studentIds = students
        .map((s) => s.id)
        .filter((id) => selected.has(id));
      const repertoireByStudent: Record<string, string> = {};
      for (const id of studentIds) {
        repertoireByStudent[id] = repertoire[id]?.trim() ?? "";
      }
      await onSubmit({
        title: title.trim(),
        startsAt,
        endsAt,
        location: location.trim(),
        description: description.trim(),
        sendReminder,
        studentIds,
        repertoireByStudent,
      });
    } catch (err) {
      setError(toUserError(err, t("unknownError")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t("title")}</label>
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titleExample")}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium mb-1">{t("starts")}</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            {t("ends")} <span className="text-muted font-normal">{t("optional")}</span>
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={endsAt}
            min={startsAt || undefined}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          {t("location")} <span className="text-muted font-normal">{t("optional")}</span>
        </label>
        <input
          className={inputClass}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("locationExample")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          {t("description")} <span className="text-muted font-normal">{t("optional")}</span>
        </label>
        <textarea
          className={inputClass}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionExample")}
        />
      </div>

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={sendReminder}
            onChange={(e) => setSendReminder(e.target.checked)}
          />
          <span>
            <span className="font-medium">
              {t("reminder")}
            </span>
            <span className="block text-muted font-normal mt-0.5">
              {t("reminderHint")}
            </span>
          </span>
        </label>
        {reminderSentAt && (
          <p className="text-xs text-muted ps-6">
            {t("reminderAlready")}{" "}
            {new Date(reminderSentAt).toLocaleString(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {t("reminderAgain")}
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
          <label className="block text-sm font-medium">{t("participants")}</label>
          <input
            className={`${inputClass} max-w-xs`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("searchStudents")}
          />
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-muted">{t("noStudents")}</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
            {filteredStudents.map((student) => {
              const checked = selected.has(student.id);
              return (
                <div key={student.id} className="p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(student.id)}
                    />
                    <span className="font-medium"><bdi dir="auto">{student.name}</bdi></span>
                  </label>
                  {checked && (
                    <input
                      className={inputClass}
                      value={repertoire[student.id] ?? ""}
                      onChange={(e) =>
                        setRepertoire((prev) => ({
                          ...prev,
                          [student.id]: e.target.value,
                        }))
                      }
                      placeholder={t("focusOptional")}
                    />
                  )}
                </div>
              );
            })}
            {filteredStudents.length === 0 && (
              <p className="p-3 text-sm text-muted">{t("noMatches")}</p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading?t("saving"):submitLabel}
      </Button>
    </form>
  );
}
