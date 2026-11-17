"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RsvpStatus } from "@/lib/supabase/types";

type RespondStatus = "yes" | "no" | "maybe";

export function PortalEventRsvp({
  token,
  eventId,
  initialStatus,
  initialPartySize,
  initialNote,
}: {
  token: string;
  eventId: string;
  initialStatus: RsvpStatus;
  initialPartySize: number | null;
  initialNote: string;
}) {
  const router = useRouter();
  const t=useTranslations("portal");
  const [status, setStatus] = useState<RespondStatus | null>(
    initialStatus === "pending" ? null : (initialStatus as RespondStatus)
  );
  const [partySize, setPartySize] = useState(
    initialPartySize != null ? String(initialPartySize) : ""
  );
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(initialStatus !== "pending");

  async function submit(next: RespondStatus) {
    setBusy(true);
    setError(null);
    setStatus(next);

    const party =
      partySize.trim() === "" ? null : Number.parseInt(partySize.trim(), 10);

    const res = await fetch(`/api/portal/${token}/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: next,
        partySize: Number.isFinite(party) ? party : null,
        note,
      }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("couldNotRsvp"));
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <p className="text-xs font-medium text-muted">
        {saved && status
          ? t("rsvpLabel",{answer:t(status==="yes"?"rsvpYes":status==="no"?"rsvpNo":"rsvpMaybe")})
          : t("rsvpQuestion")}
      </p>
      <div className="flex flex-wrap gap-2">
        {(["yes", "maybe", "no"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => void submit(value)}
          >
            {t(value==="yes"?"rsvpYes":value==="maybe"?"rsvpMaybe":"rsvpNo")}
          </Button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted sm:w-28">
          {t("rsvpPartySize")}
          <input
            type="number"
            min={1}
            max={99}
            inputMode="numeric"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
            placeholder={t("optional")}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted flex-1 min-w-0">
          {t("rsvpNote")}
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("optionalRsvpNote")}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground"
          />
        </label>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {saved && status && (
        <p className="text-xs text-muted">
          {t("rsvpHint")}
        </p>
      )}
    </div>
  );
}
