"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

export function StudentNotesEditor({
  studentId,
  initialNotes,
}: {
  studentId: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const t=useTranslations("studentNotes");
  const { showToast } = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch(`/api/students/${studentId}`,{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({teacherNotes:notes}),
      });
      if (!response.ok) {
        showToast(t("saveFailed"),"error");
        return;
      }
      setDirty(false);
      router.refresh();
    } catch {
      showToast(t("connectionFailed"),"error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="sm" className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <label className="text-xs text-muted font-medium">
            {t("title")}
          </label>
          <p className="text-[11px] text-muted mt-0.5">
            {t("hint")}
          </p>
        </div>
        {dirty && (
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
            {saving?t("saving"):t("save")}
          </Button>
        )}
      </div>
      <RichTextEditor
        value={notes}
        onChange={(html) => {
          setNotes(html);
          setDirty(true);
        }}
        placeholder={t("placeholder")}
        minHeightClass="min-h-[160px]"
      />
    </Card>
  );
}
