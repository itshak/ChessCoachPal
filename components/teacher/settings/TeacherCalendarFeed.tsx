"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyLinkClient } from "@/components/teacher/CopyLinkClient";

/**
 * Read-only calendar feed controls. The URL is public and token-gated; the
 * only revocation is rotation, so the reset button is the security control.
 */
export function TeacherCalendarFeed({ token }: { token: string }) {
  const router = useRouter();
  const t=useTranslations("calendarFeed");
  const [busy, setBusy] = useState(false);
  const feedPath = `/api/feeds/${token}/calendar`;

  async function handleReset() {
    setBusy(true);
    const res = await fetch("/api/teacher/calendar-token", { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <h2 className="font-semibold mb-1">{t("title")}</h2>
      <p className="text-sm text-muted mb-3">
        {t("description")}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <CopyLinkClient
          url={feedPath}
          title={t("linkTitle")}
          label={t("feedLink")}
        />
        <a
          href={feedPath}
          download
          className="inline-flex items-center justify-center font-semibold bg-surface border border-border text-foreground hover:border-primary/50 px-3 py-1.5 text-xs rounded-lg transition-colors"
        >
          {t("download")}
        </a>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={handleReset}
          title={t("resetWarning")}
        >
          {t("reset")}
        </Button>
      </div>
    </Card>
  );
}
