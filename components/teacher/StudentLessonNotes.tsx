"use client";
import {useTranslations} from "next-intl";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { formatShortDate } from "@/lib/schedule";

export type StudentLessonNote = {
  id: string;
  body: string;
  privateBody: string;
  sharedWithContacts: boolean;
  emailedAt: string | null;
  lessonDate: string;
  updatedAt: string;
};

const PREVIEW_COUNT = 5;

export function StudentLessonNotes({
  notes,
  timezone,
}: {
  notes: StudentLessonNote[];
  timezone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const t=useTranslations("lessonNotes");
  const calendar=useTranslations("calendar");
  const ordered=[...notes].sort((a,b)=>b.lessonDate.localeCompare(a.lessonDate)||b.updatedAt.localeCompare(a.updatedAt));
  const visible = expanded ? ordered : ordered.slice(0, PREVIEW_COUNT);
  const hiddenCount = notes.length - PREVIEW_COUNT;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{t("title")}</h2>
      {notes.length === 0 ? (
        <Card className="text-center text-muted text-sm">
          {t("empty")}
        </Card>
      ) : (
        <div className="space-y-3 border-s border-border ps-3">
          {visible.map((note) => {
            const hasFamily = Boolean(note.body.trim());
            const hasPrivate = Boolean(note.privateBody.trim());
            return (
              <Card key={note.id} padding="sm">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted mb-3">
                  <time dateTime={note.lessonDate}>
                    {formatShortDate(`${note.lessonDate}T12:00:00`, timezone)}
                  </time>
                  {hasFamily && (
                    <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">
                      {calendar("familyNote")}
                    </span>
                  )}
                  {hasPrivate && (
                    <span className="rounded bg-surface-dim text-muted px-1.5 py-0.5">
                      {calendar("privateNote")}
                    </span>
                  )}
                  {note.emailedAt && <span>{t("emailed")}</span>}
                </div>
                {hasPrivate && (
                  <div className="mb-3 rounded-lg border border-border bg-background p-3">
                    <p className="text-sm font-semibold text-muted mb-1">
                      {t("private")}
                    </p>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" dir="auto">{note.privateBody}</p>
                  </div>
                )}
                {hasFamily && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-muted mb-1">
                      {calendar("familyNote")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                  </div>
                )}
              </Card>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm text-primary hover:underline cursor-pointer"
            >
              {expanded?t("showLess"):t("showMore",{count:hiddenCount})}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
