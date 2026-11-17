"use client";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";

/**
 * Student detail title with a small pencil to rename inline.
 */
export function EditableStudentName({
  studentId,
  initialName,
}: {
  studentId: string;
  initialName: string;
}) {
  const router = useRouter();
  const t=useTranslations("studentName");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      setValue(initialName);
      setEditing(false);
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/students/${studentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (!res.ok) {
      setValue(initialName);
      setEditing(false);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(initialName);
              setEditing(false);
            }
          }}
          className="text-2xl font-bold px-2 py-0.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 w-full max-w-md"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-xs text-primary hover:text-primary-dark font-semibold cursor-pointer shrink-0"
        >
          {saving?"…":t("save")}
        </button>
      </span>
    );
  }

  return (
    <h1 className="text-2xl font-bold inline-flex items-center gap-2">
      <bdi dir="auto">{initialName}</bdi>
      <button
        type="button"
        onClick={() => {
          setValue(initialName);
          setEditing(true);
        }}
        aria-label={t("editStudentName")}
        title={t("editName")}
        className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-dim transition-colors cursor-pointer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>
    </h1>
  );
}
