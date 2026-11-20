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
  const visible = expanded ? notes : notes.slice(0, PREVIEW_COUNT);
  const hiddenCount = notes.length - PREVIEW_COUNT;

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{t("title")}</h2>
      {notes.length === 0 ? (
        <Card className="text-center text-muted text-sm">
          {t("empty")}
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((note) => {
            const hasFamily = Boolean(note.body.trim());
            const hasPrivate = Boolean(note.privateBody.trim());
            return (
              <Card key={note.id} padding="sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-2">
                  <span>
                    {formatShortDate(`${note.lessonDate}T12:00:00`, timezone)}
                  </span>
                  {hasFamily && (
                    <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">
                      {t("family")}
                    </span>
                  )}
                  {hasPrivate && (
                    <span className="rounded bg-surface-dim text-muted px-1.5 py-0.5">
                      {t("private")}
                    </span>
                  )}
                  {note.emailedAt && <span>{t("emailed")}</span>}
                </div>
                {hasPrivate && (
                  <div className="mb-2">
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                      {t("private")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{note.privateBody}</p>
                  </div>
                )}
                {hasFamily && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-0.5">
                      {t("forStudent")}
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
