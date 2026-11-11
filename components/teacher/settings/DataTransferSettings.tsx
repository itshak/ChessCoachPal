"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function DataTransferSettings() {
  const router = useRouter();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "chesscoachpal-export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Export downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const headers = { "Content-Type": "application/json" };
      const previewResponse = await fetch("/api/settings/import", {
        method: "PUT",
        headers,
        body: JSON.stringify({ payload: raw }),
      });
      const preview = await previewResponse.json().catch(() => ({}));
      if (!previewResponse.ok) {
        throw new Error(preview.error ?? "Could not preview import");
      }
      const counts = preview.counts as Record<string, number>;
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const warnings = Array.isArray(preview.warnings)
        ? (preview.warnings as string[])
        : [];
      const reviewed = await confirm({
        title: "Review ChessCoachPal import",
        message:
          `Import ${total} rows (${preview.bytes} bytes) from ${file.name}. ` +
          `Existing matching IDs may be overwritten. ` +
          warnings.join(" ") +
          ` Review digest: ${preview.sha256}.`,
        confirmLabel: "Import reviewed backup",
      });
      if (!reviewed) return;

      const response = await fetch("/api/settings/import", {
        method: "POST",
        headers,
        body: JSON.stringify({
          payload: raw,
          expectedSha256: preview.sha256,
          confirmed: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? "Import failed");
      }
      if (data.sha256 !== preview.sha256) {
        throw new Error("Import receipt digest did not match the reviewed backup.");
      }
      const imported = Object.values(data.counts as Record<string, number>)
        .reduce((a, b) => a + b, 0);
      setMessage(`Import complete (${imported} rows upserted; reviewed digest verified).`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-lg mb-1">Export &amp; Import all ChessCoachPal data</h2>
      <p className="text-sm text-muted mb-4">
        Download a full JSON backup of your studio data: students, families,
        schedules, coaching sessions, attendance, chess learning observations,
        study links, skills, invoices, events, RSVPs, and settings. Payment and
        AI keys, OAuth credentials, and uploaded binary objects are excluded.
        Import restores data into this account by upserting matching IDs.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={exporting || importing}
          onClick={handleExport}
        >
          {exporting ? "Exporting…" : "Export all data"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={exporting || importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? "Importing…" : "Import from file…"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void handleImportFile(file);
          }}
        />
      </div>

      {message && <p className="text-sm text-success mt-3">{message}</p>}
      {error && <p className="text-sm text-error mt-3">{error}</p>}
    </Card>
  );
}
