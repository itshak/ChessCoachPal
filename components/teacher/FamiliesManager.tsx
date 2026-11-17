"use client";

import { useEffect, useRef, useState } from "react";
import {useTranslations} from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyLinkClient } from "@/components/teacher/CopyLinkClient";
import {
  FamilyForm,
  type FamilyGuardian,
  type FamilyStudent,
} from "@/components/teacher/FamilyForm";
import { familyDisplayName } from "@/lib/guardians";

export function FamiliesManager({
  guardians,
  students,
}: {
  guardians: FamilyGuardian[];
  students: FamilyStudent[];
}) {
  const router = useRouter();
  const t=useTranslations("families");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FamilyGuardian | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) return;
    // Tall form: bring the card to the top of the viewport so the fields
    // are not stranded below the fold when Edit is clicked near the bottom.
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    const res = await fetch(`/api/guardians/${confirmDelete.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    setConfirmDelete(null);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {editing === "new" ? (
        <div ref={editorRef} className="scroll-mt-4">
          <FamilyForm
            key="new"
            guardian={null}
            students={students}
            onClose={() => setEditing(null)}
          />
        </div>
      ) : (
        <div className="mb-4">
          <Button size="sm" onClick={() => setEditing("new")}>
            {t("add")}
          </Button>
        </div>
      )}

      {guardians.length === 0 && editing === null ? (
        <Card className="text-center text-muted py-12">
          <p className="text-lg">{t("empty")}</p>
          <p className="text-sm">
            {t("emptyHint")}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {guardians.map((g) => {
            const members = students.filter((s) => s.guardian_id === g.id);
            const primaryContact = [g.email, g.phone].filter(Boolean).join(" · ");
            const contacts = [
              // With an explicit family name, say who the primary contact is
              g.family_name
                ? `${g.name}${primaryContact ? ` — ${primaryContact}` : ""}`
                : primaryContact,
              g.secondary_name
                ? `${g.secondary_name}${
                    [g.secondary_email, g.secondary_phone].filter(Boolean).length > 0
                      ? ` — ${[g.secondary_email, g.secondary_phone].filter(Boolean).join(" · ")}`
                      : ""
                  }`
                : null,
            ].filter(Boolean);
            const isEditing = editing === g.id;
            return (
              <Card
                key={g.id}
                ref={isEditing ? editorRef : undefined}
                padding="sm"
                className={
                  isEditing
                    ? "scroll-mt-4 ring-2 ring-primary/35 border-primary/40"
                    : undefined
                }
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <Link
                      href={`/families/${g.id}`}
                      className="font-semibold text-lg hover:text-primary transition-colors"
                    >
                      <bdi dir="auto">{familyDisplayName(g)}</bdi>
                    </Link>
                    {contacts.length > 0 ? (
                      contacts.map((line, i) => (
                        <div key={i} className="text-sm text-muted">
                          <bdi dir="auto">{line}</bdi>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted">{t("noContact")}</div>
                    )}
                    <div className="text-xs text-muted mt-1">
                      {members.length > 0
                        ? t("members",{names:members.map(m=>m.name).join(", ")})
                        : t("noMembers")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CopyLinkClient
                      url={`/portal/${g.portal_token}`}
                      title={t("portalTitle")}
                      label={t("portal")}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={isEditing}
                      onClick={() => setEditing(isEditing ? null : g.id)}
                    >
                      {isEditing ? t("close") : t("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-error"
                      onClick={() => setConfirmDelete(g)}
                    >
                      {t("delete")}
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <FamilyForm
                      key={g.id}
                      guardian={g}
                      students={students}
                      onClose={() => setEditing(null)}
                      embedded
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-sm w-full">
            <h3 className="font-semibold mb-2">
              {t("deleteQuestion",{name:familyDisplayName(confirmDelete)})}
            </h3>
            <p className="text-sm text-muted mb-4">
              {t("deleteWarning")}
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>
                {t("cancel")}
              </Button>
              <Button size="sm" variant="error" disabled={busy} onClick={handleDelete}>
                {busy ? t("deleting") : t("delete")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
