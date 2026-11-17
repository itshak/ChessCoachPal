"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PortalCancelButton({
  token,
  lessonId,
  studentId,
  windowHours,
}: {
  token: string;
  lessonId: string;
  studentId: string;
  windowHours: number;
}) {
  const router = useRouter();
  const t=useTranslations("portal");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/portal/${encodeURIComponent(token)}/sessions/${lessonId}/students/${studentId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("couldNotCancel"));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-error hover:underline cursor-pointer shrink-0"
      >
        {t("cancelLesson")}
      </button>
    );
  }

  return (
    <Card padding="sm" className="mt-2 w-full basis-full">
      <p className="text-sm font-medium mb-1">{t("cancelTitle")}</p>
      <p className="text-xs text-muted mb-2">
        {t("cancelWarning",{hours:windowHours})}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("optionalNote")}
        rows={2}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-2"
      />
      {error && <p className="text-xs text-error mb-2">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? t("cancelling") : t("confirmCancel")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {t("keepLesson")}
        </Button>
      </div>
    </Card>
  );
}
