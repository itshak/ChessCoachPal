"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useEffect, useId, useRef, useState } from "react";
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



type Candidate={id:string;name:string;archived:boolean};
type ReviewedEnvelope={
 calendar:{day:string;timezone:string};
 identities:{sourceRow:number;mode:"existing"|"create"|"createArchived";name?:string;studentId?:string;
  memberships:{workplaceId:string;mode:"new"|"current"|"none"}[]}[];
};

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
  const selectorBaseId=useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unconfirmed,setUnconfirmed]=useState(false);
  const [pendingNetwork,setPendingNetwork]=useState(false);
  const approvedBody=useRef<string|null>(null);
  const sending=useRef(false);
  const importedReceiptRef=useRef<HTMLParagraphElement>(null);
  const definitiveErrorRef=useRef<HTMLParagraphElement>(null);
  const focusDefinitiveError=useRef(false);
  const focusReceipt=useRef(false);
  const controlsLocked=busy||unconfirmed;
  useEffect(()=>{
    if(message&&focusReceipt.current){focusReceipt.current=false;importedReceiptRef.current?.focus();}
  },[message]);
  useEffect(()=>{
    if(error&&focusDefinitiveError.current){
      focusDefinitiveError.current=false;definitiveErrorRef.current?.focus();
    }
  },[error]);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<NormalizedImportRow[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  const [filename, setFilename] = useState<string | null>(null);
  const [workplaceId,setWorkplaceId]=useState("");
  const [workplaceChoices,setWorkplaceChoices]=useState<Array<{id:string;name:string}>>([]);

  const [reviewDigest,setReviewDigest]=useState<string|null>(null);
  const [reviewedEnvelope,setReviewedEnvelope]=useState<ReviewedEnvelope|null>(null);
  const [proposedDefault,setProposedDefault]=useState<string|null>(null);
  const [workplaceColumn,setWorkplaceColumn]=useState("");
  const [studentChoices,setStudentChoices]=useState<Record<string,string>>({});
  const [targets,setTargets]=useState<{sourceRow:number;workplaceId:string;workplaceName:string}[]>([]);
  const [workplaceIssues,setWorkplaceIssues]=useState<{sourceRow:number|null;code:string}[]>([]);
  const [identityIssues,setIdentityIssues]=useState<{sourceRow:number;code:string;
   candidates?:Candidate[]}[]>([]);
  const [candidateOptions,setCandidateOptions]=useState<Record<string,Candidate[]>>({});
  const selectorFocus=useRef<string|null>(null);
  const selectorRefs=useRef<Record<string,HTMLSelectElement|null>>({});
  useEffect(()=>{
   if(!busy&&selectorFocus.current){
    const select=selectorRefs.current[selectorFocus.current];selectorFocus.current=null;select?.focus();
   }
  },[busy]);

  const workspaceInput=(selected:string,column:string)=>column
    ?{workplaceColumn:column,fallbackWorkplaceId:selected||undefined}
    :{workplaceId:selected||undefined};

  async function reviewWorkplace(rawRows:Record<string,string>[], nextMapping:ColumnMapping, selected:string,
   column=workplaceColumn,choices=studentChoices){
    setReviewDigest(null);setReviewedEnvelope(null);
    const response=await fetch("/api/import/spreadsheet/parse",{
      method:"PUT",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({rows:rawRows,mapping:nextMapping,...workspaceInput(selected,column),studentChoices:choices}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(toUserError(data,t("previewFailed")));
    setPreviewRows(data.previewRows??[]);
    setPreviewTotal(data.previewTotal??0);
    setIssues(data.issues??[]);
    setWorkplaceChoices(data.workplaces??[]);
    setProposedDefault(data.proposedDefaultWorkplaceId??null);
    setWorkplaceIssues(data.workplaceIssues??[]);
    const newIssues=(data.identityIssues??[]) as typeof identityIssues;
    setIdentityIssues(newIssues);
    setCandidateOptions(old=>{
      const kept=Object.fromEntries(Object.entries(old).filter(([row])=>choices[row]!==undefined));
      for(const issue of newIssues)if(issue.candidates) kept[String(issue.sourceRow)]=issue.candidates;
      return kept;
    });
    setTargets(data.workplaceTargets??[]);
    setReviewDigest(data.reviewDigest??null);
    setReviewedEnvelope(data.reviewedEnvelope??null);
  }

  async function chooseWorkplace(selected:string,column=workplaceColumn,choices=studentChoices){
    setWorkplaceId(selected);setWorkplaceColumn(column);setStudentChoices(choices);setBusy(true);setError(null);
    try{await reviewWorkplace(rows,mapping,selected,column,choices);}
    catch(e){setError(toUserError(e,t("previewFailed")));}
    finally{setBusy(false);}
  }

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
      setWorkplaceId("");setWorkplaceColumn("");setStudentChoices({});setCandidateOptions({});
      await reviewWorkplace(data.rows??[],data.mapping??{},"","",{});
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
    setProposedDefault(null);setWorkplaceColumn("");setStudentChoices({});setCandidateOptions({});
    setReviewDigest(null);setReviewedEnvelope(null);setTargets([]);setWorkplaceIssues([]);setIdentityIssues([]);
    setWorkplaceId("");
  }

  async function refreshPreview(nextMapping: ColumnMapping) {
    setMapping(nextMapping);setStudentChoices({});setCandidateOptions({});
    setBusy(true);
    setError(null);
    try {
      await reviewWorkplace(rows,nextMapping,workplaceId,workplaceColumn,{});
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
    if(sending.current)return;
    if(!approvedBody.current&&(!reviewDigest||!reviewedEnvelope||controlsLocked))return;
    sending.current=true;setBusy(true);setError(null);
    const wasUnconfirmed=approvedBody.current!==null;
    try{
      if(!approvedBody.current){
        const ok=await confirm({
          title:t("confirmImportTitle"),
          message:t("confirmImportWarning",{count:previewTotal,
            workplace:workplaceColumn?(new Set(targets.map(target=>target.workplaceName)).size>4
              ?t("reviewedWorkplaces"):Array.from(new Set(targets.map(target=>target.workplaceName))).join(", "))
              :(workplaceChoices.find(w=>w.id===workplaceId)?.name??"")}),
          confirmLabel:t("import"),
        });
        if(!ok)return;
        approvedBody.current=JSON.stringify({rows,mapping,...workspaceInput(workplaceId,workplaceColumn),studentChoices,reviewDigest,reviewedEnvelope,confirmed:true});
      }
      setMessage(null);setPendingNetwork(true);
      const res=await fetch("/api/import/spreadsheet/commit",{
        method:"POST",headers:{"Content-Type":"application/json"},body:approvedBody.current,
        signal:AbortSignal.timeout(20000),
      });
      const data=await res.json();
      if(res.ok&&typeof data.receiptId==="string"&&Number.isInteger(data.studentsCreated)){
        approvedBody.current=null;setUnconfirmed(false);focusReceipt.current=true;
        setMessage(t("importReceipt",{students:data.studentsCreated,contacts:data.contactsCreated??0,
          enrollments:data.enrollmentsCreated??0,skipped:data.studentsSkipped}));
        clearPreview();router.refresh();return;
      }
      const trustedRetryDenial=res.status===409&&data.authoritativeDenial===true&&
        ["CAPACITY_EXCEEDED","IMPORT_PREVIEW_CHANGED"].includes(data.code);
      const definite=trustedRetryDenial||!wasUnconfirmed&&(
        (res.status===400&&data.code==="VALIDATION_ERROR")||
        (res.status===422&&["WORKPLACE_REQUIRED","IMPORT_REVIEW_REQUIRED"].includes(data.code))||
        (res.status===409&&["CAPACITY_EXCEEDED","IMPORT_REPLAY_CONFLICT","IMPORT_PREVIEW_CHANGED"].includes(data.code)));
      if(definite){
        approvedBody.current=null;setUnconfirmed(false);
        if(data.code==="IMPORT_PREVIEW_CHANGED"){
          await reviewWorkplace(rows,mapping,workplaceId);
        }
        if(data.code==="WORKPLACE_REQUIRED"){
          setReviewDigest(null);setWorkplaceId("");setWorkplaceChoices(data.workplaces??[]);
        }
        focusDefinitiveError.current=true;setError(toUserError(data,t("importFailed")));return;
      }
      setUnconfirmed(true);
    }catch(e){
      if(approvedBody.current)setUnconfirmed(true);
      else setError(toUserError(e,t("importFailed")));
    }finally{
      sending.current=false;setPendingNetwork(false);setBusy(false);
    }
  }

  function displayIssue(message:string):string{
    if(message==="Duplicate normalized student name in this spreadsheet")return t("duplicateStudentName");
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
          disabled={controlsLocked}
          onClick={() => fileRef.current?.click()}
        >
          {busy&&!filename?t("reading"):t("upload")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={controlsLocked}
          onClick={downloadTemplate}
        >
          {t("downloadTemplate")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          disabled={controlsLocked}
          accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file&&!controlsLocked) void handleFile(file);
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
                  disabled={controlsLocked}
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

          {workplaceChoices.length===0&&<p role="status" className="text-sm">{t("workplaceCreateFirst")}</p>}
          {proposedDefault&&<p role="status" className="text-sm">{t("workplaceSuggested",{
            name:workplaceChoices.find(w=>w.id===proposedDefault)?.name??"",
          })}</p>}
          {workplaceChoices.length>0&&<label className="block text-sm space-y-1">
            <span className="font-medium">{t("workplaceColumn")}</span>
            <select className={selectClass} value={workplaceColumn} disabled={controlsLocked}
              onChange={e=>void chooseWorkplace("",e.target.value,{})}>
              <option value="">{t("batchWorkplace")}</option>
              {headers.map(h=><option key={h}>{h}</option>)}
            </select>
          </label>}
          {workplaceChoices.length>0 && <label className="block text-sm space-y-1">
            <span className="font-medium">{t(workplaceColumn?"blankWorkplaceFallback":"workplaceLabel")}</span>
            <select className={selectClass} value={workplaceId} disabled={controlsLocked} onChange={e=>void chooseWorkplace(e.target.value)}>
              <option value="">{t("workplacePlaceholder")}</option>
              {workplaceChoices.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>}
          {workplaceColumn&&<p className="text-sm">{t("multiWorkplaceInstructions")}</p>}
          {workplaceIssues.map((issue,i)=><p role="alert" key={i} className="text-sm">
            {issue.sourceRow?t("rowNumber",{row:issue.sourceRow})+" ":""}
            {t(issue.code==="WORKPLACE_NAME_AMBIGUOUS"?"workplaceNameAmbiguous":
               issue.code==="WORKPLACE_ROW_REQUIRED"?"workplaceRowRequired":
               issue.code==="WORKPLACE_TARGET_DUPLICATE"?"duplicateWorkplaceTarget":"workplaceChoiceInvalid")}
          </p>)}
          {identityIssues.map(issue=><p role="alert" key={issue.sourceRow} className="text-sm">
            {t("rowNumber",{row:issue.sourceRow})} {t(
             issue.code==="IMPORT_IDENTITY_CHOICE_REQUIRED"?"chooseExisting":
             issue.code==="ARCHIVED_IMPORT_IDENTITY"?"archivedExistingBlocked":
             issue.code==="IMPORT_FUTURE_ENROLLMENT_CONFLICT"?"futureMembershipBlocked":"identityUnavailable",
            )}
          </p>)}
          {Object.entries(candidateOptions).map(([row,options])=><div className="text-sm" key={row}>
            <label className="block" htmlFor={selectorBaseId+row}>{t("rowExistingStudent",{row:Number(row)})}</label>
            <select id={selectorBaseId+row} className={selectClass} disabled={controlsLocked} value={studentChoices[row]??""}
             ref={node=>{selectorRefs.current[row]=node;}}
             onChange={e=>{
              const next={...studentChoices};selectorFocus.current=row;
              if(e.target.value)next[row]=e.target.value;else delete next[row];
              void chooseWorkplace(workplaceId,workplaceColumn,next);
             }}>
             <option value="">{t("notMapped")}</option>
             {options.map(student=><option key={student.id} value={student.id} disabled={student.archived}>
              {student.name} ({student.id}{student.archived?" · "+t("archived"):""})
             </option>)}
            </select>
          </div>)}
          {reviewedEnvelope&&<p role="status" className="text-sm font-semibold">{t("reviewedCalendar",reviewedEnvelope.calendar)}</p>}
          <div className="flex flex-wrap gap-2">
            {aiConfigured && (
              <Button
                size="sm"
                variant="secondary"
                disabled={controlsLocked}
                onClick={() => void suggestWithAi()}
              >
                {t("suggestAi")}
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy||(!unconfirmed&&(previewTotal===0||!reviewDigest))}
              onClick={() => void commit()}
            >
              {busy?t("working"):unconfirmed?t("retryExactImport"):t("importCount",{count:previewTotal})}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={controlsLocked}
              onClick={clearPreview}
            >
              {t("cancel")}
            </Button>
          </div>

          {previewRows.length > 0 && (
            <div role="region" aria-label={t("reviewRowsLabel")} tabIndex={0} className="overflow-x-auto text-xs">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-start text-muted border-b border-border">
                    <th className="py-1 pe-2">{t("row")}</th>
                    <th className="py-1 pe-2">{t("student")}</th>
                    <th className="py-1 pe-2">{t("status")}</th>
                    <th className="py-1 pe-2">{t("reviewedWorkplaceColumn")}</th>
                    <th className="py-1 pe-2">{t("guardian")}</th>
                    <th className="py-1 pe-2">{t("email")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => {
                   const identity=reviewedEnvelope?.identities.find(i=>i.sourceRow===r.sourceRow);
                   const rowTargets=targets.filter(i=>i.sourceRow===r.sourceRow);
                   return (
                    <tr key={r.sourceRow} className="border-b border-border/60">
                      <td className="py-1 pe-2">{r.sourceRow}</td>
                      <td className="py-1 pe-2"><bdi dir="auto">{r.studentName}</bdi></td>
                      <td className="py-1 pe-2">{identity?.mode==="existing"?
                       t("reviewedExistingIdentity",{name:identity.name??"",id:identity.studentId??""}):
                       r.archived?t("archivedNoEnrollment"):identity?.mode==="create"?t("newProfileEffect"):t("active")}</td>
                      <td className="py-1 pe-2">
                       {!rowTargets.length?"—":<ul>{rowTargets.map(target=>{
                        const effect=identity?.memberships.find(m=>m.workplaceId===target.workplaceId)?.mode;
                        return <li key={target.workplaceId}><bdi dir="auto">{target.workplaceName}</bdi>
                         {effect?" · "+t(effect==="current"?"currentMembershipEffect":
                           effect==="new"?"newMembershipEffect":"noMembershipEffect"):""}
                        </li>;
                       })}</ul>}
                      </td>
                      <td className="py-1 pe-2">
                        {r.guardianName || r.familyName || "—"}
                      </td>
                      <td className="py-1 pe-2">{r.email || "—"}</td>
                    </tr>
                  );})}
                </tbody>
              </table>
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

      {pendingNetwork&&<p role="status">{t("importPending")}</p>}
      {unconfirmed&&!busy&&<p role="alert">{t("importUnconfirmed")}</p>}
      {message && <p ref={importedReceiptRef} role="status" tabIndex={-1} className="text-sm text-success mt-3">{message}</p>}
      {error && <p ref={definitiveErrorRef} role="alert" tabIndex={-1} className="text-sm text-error mt-3">{error}</p>}
    </Card>
  );
}
