"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useRef, useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type NormalizedImportRow,
} from "@/lib/spreadsheet-import";



const selectClass =
  "px-2 py-1.5 rounded-lg border border-border bg-background text-sm w-full";

export function SpreadsheetImportSettings({
  aiConfigured,
}: {
  aiConfigured: boolean;
}) {
  const t=useTranslations("studentImport");
  const toUserError=useLocalizedApiError();
  const router=useRouter();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<NormalizedImportRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [workplaceId,setWorkplaceId]=useState("");
  const [workplaceChoices,setWorkplaceChoices]=useState<Array<{id:string;name:string}>>([]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/spreadsheet/parse", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(toUserError(data, t("parseFailed")));

      setFilename(data.filename);
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
      setMapping(data.mapping ?? {});
      setPreviewRows(data.previewRows ?? []);
      setPreviewTotal(data.previewTotal ?? 0);
      setIssues(data.issues ?? []);
    } catch (e) {
      setError(toUserError(e, t("parseFailed")));
      clearPreview();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearPreview() {
    setFilename(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreviewRows([]);
    setPreviewTotal(0);
    setIssues([]);
    setWorkplaceChoices([]);
    setWorkplaceId("");
  }

  async function refreshPreview(nextMapping: ColumnMapping) {
    setMapping(nextMapping);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/spreadsheet/parse", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping: nextMapping }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(toUserError(data, t("previewFailed")));
      setPreviewRows(data.previewRows ?? []);
      setPreviewTotal(data.previewTotal ?? 0);
      setIssues(data.issues ?? []);
    } catch (e) {
      setError(toUserError(e, t("previewFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function suggestWithAi() {
    const approved = await confirm({
      title:t("aiConsentTitle"),
      message:t("aiConsentWarning"),
      confirmLabel:t("aiConsentConfirm"),
    });
    if (!approved) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/spreadsheet/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers,
          sampleRows: rows.slice(0, 5),
          useAi: true,
          confirmedExternal: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(toUserError(data, t("suggestFailed")));
      await refreshPreview({ ...mapping, ...data.mapping });
      if (data.warning) setMessage(data.warning);
    } catch (e) {
      setError(toUserError(e, t("suggestFailed")));
      setBusy(false);
    }
  }

  async function commit() {
    const ok = await confirm({
      title:t("confirmImportTitle"),
      message:t("confirmImportWarning",{count:previewTotal}),
      confirmLabel:t("import"),
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/import/spreadsheet/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mapping,workplaceId:workplaceId||undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if(data.code==="WORKPLACE_REQUIRED"){
        setWorkplaceChoices(data.workplaces??[]);
        throw new Error(data.error??t("workplaceRequired"));
      }
      if (!res.ok) throw new Error(toUserError(data, t("importFailed")));
      setMessage(
        t("importReceipt",{students:data.studentsCreated,families:data.contactsCreated??0,skipped:data.studentsSkipped})
      );
      clearPreview();
      router.refresh();
    } catch (e) {
      setError(toUserError(e, t("importFailed")));
    } finally {
      setBusy(false);
    }
  }

  function displayIssue(message:string):string{
    if(message==="Missing student name (skipped)")return t("missingName");
    const birth=message.match(/^Could not parse birthdate "(.+)"$/);
    if(birth)return t("invalidBirthdate",{value:birth[1]});
    const archive=message.match(/^Unknown archive status "(.+)" \(row skipped\)$/);
    if(archive)return t("unknownArchiveStatus",{value:archive[1]});
    return message;
  }

  function downloadTemplate() {
    const header = [
      t("template.student"),
      t("template.parent"),
      t("template.email"),
      t("template.phone"),
      t("template.birthdate"),
      t("template.level"),
    ].join(",");
    const sample = [
      "Alex Rivera,Jordan Rivera,jordan@example.com,555-0100,2015-04-12,4",
      "Sam Rivera,Jordan Rivera,jordan@example.com,555-0100,,",
    ].join("\n");
    const blob = new Blob([`\uFEFF${header}\n${sample}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chesscoachpal-students-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <h2 className="font-semibold text-lg mb-1">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">
        {t("description")}
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy&&!filename?t("reading"):t("upload")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={downloadTemplate}
        >
          {t("downloadTemplate")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {filename && (
        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm">
            <span className="font-medium break-all">{filename}</span>
            <span className="text-muted">
              {" "}
              · {t("rowsReady",{rows:rows.length,ready:previewTotal})}
            </span>
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {IMPORT_FIELDS.map((field) => (
              <label key={field} className="text-xs space-y-1">
                <span className="text-muted font-medium">
                  {t(`fields.${field}`)}
                  {field === "student_name" ? " *" : ""}
                </span>
                <select
                  className={selectClass}
                  value={mapping[field] ?? ""}
                  onChange={(e) => {
                    const next = {
                      ...mapping,
                      [field]: e.target.value || null,
                    };
                    void refreshPreview(next);
                  }}
                >
                  <option value="">{t("notMapped")}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {workplaceChoices.length>0 && <label className="block text-sm space-y-1">
            <span className="font-medium">{t("workplaceLabel")}</span>
            <select className={selectClass} value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)}>
              <option value="">{t("workplacePlaceholder")}</option>
              {workplaceChoices.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>}
          <div className="flex flex-wrap gap-2">
            {aiConfigured && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void suggestWithAi()}
              >
                {t("suggestAi")}
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy || previewTotal === 0 || (workplaceChoices.length>0&&!workplaceId)}
              onClick={() => void commit()}
            >
              {busy?t("working"):t("importCount",{count:previewTotal})}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={clearPreview}
            >
              {t("cancel")}
            </Button>
          </div>

          {previewRows.length > 0 && (
            <div className="overflow-x-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-start text-muted border-b border-border">
                    <th className="py-1 pe-2">{t("row")}</th>
                    <th className="py-1 pe-2">{t("student")}</th>
                    <th className="py-1 pe-2">{t("status")}</th>
                    <th className="py-1 pe-2">{t("guardian")}</th>
                    <th className="py-1 pe-2">{t("email")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 12).map((r) => (
                    <tr key={r.sourceRow} className="border-b border-border/60">
                      <td className="py-1 pe-2">{r.sourceRow}</td>
                      <td className="py-1 pe-2"><bdi dir="auto">{r.studentName}</bdi></td>
                      <td className="py-1 pe-2">{r.archived?t("archived"):t("active")}</td>
                      <td className="py-1 pe-2">
                        {r.guardianName || r.familyName || "—"}
                      </td>
                      <td className="py-1 pe-2">{r.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewTotal > 12 && (
                <p className="text-muted mt-1">
                  {t("showingRows",{count:previewTotal})}
                </p>
              )}
            </div>
          )}

          {issues.length > 0 && (
            <ul className="text-xs text-muted list-disc list-inside">
              {issues.slice(0, 8).map((i) => (
                <li key={`${i.row}-${i.message}`}>
                  {t("rowNumber",{row:i.row})} {displayIssue(i.message)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {message && <p className="text-sm text-success mt-3">{message}</p>}
      {error && <p className="text-sm text-error mt-3">{error}</p>}
    </Card>
  );
}
