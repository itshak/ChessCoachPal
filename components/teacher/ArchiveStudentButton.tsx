"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ArchiveStudentButton({
  studentId,
  studentName,
  archived,
}: {
  studentId: string;
  studentName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (!archived) {
        const response = await fetch(`/api/students/${studentId}?archivePreview=true`);
        const preview = await response.json().catch(() => null);
        if (!response.ok || !preview) {
          showToast(preview?.error ?? "Could not verify student commitments", "error");
          return;
        }
        if (!preview.canArchive) {
          const blockers = Object.entries(preview.blockers as Record<string, number>)
            .filter(([, count]) => count > 0)
            .map(([name, count]) => `${name}: ${count}`).join(", ");
          showToast("Resolve before archiving: " + blockers, "error");
          return;
        }
        if (!window.confirm("Archive this student? All teaching history will be retained.")) return;
      }
      const res = await fetch(`/api/students/${studentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        showToast(err?.error ?? "Failed to update student", "error");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      showToast("Failed to update student", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={toggle}
      title={
        archived
          ? `Restore ${studentName} to active`
          : `Archive ${studentName} (won't count toward free-plan limits)`
      }
    >
      {busy ? "…" : archived ? "Restore" : "Archive"}
    </Button>
  );
}
