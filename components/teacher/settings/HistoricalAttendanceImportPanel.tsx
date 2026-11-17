"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useState,useEffect,useCallback} from "react";
import {useLocale,useTranslations} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useConfirm} from "@/components/ui/confirm-dialog";

type Stage={stageId:string;filename:string;bytes:number;sha256:string;
  expiresAt:string;rowCount:number;headers:string[]};
type Issue={row:number;code:string;message:string;candidateIds?:string[]};
type Row={sourceRow:number;studentId:string;workplaceId:string;
  mode:"dated"|"aggregate";attendedOn:string|null;
  periodStart:string|null;periodEnd:string|null;attendanceStatus:string;lessonCount:number};
type Preview={
  previewDigest:string;sourceRows:number;previewTotal:number;
  previewRows:Row[];issues:Issue[];issueCount:number;canCommit:boolean;
  mapping:Record<string,string|null>;filename:string;
};
type Roster={id:string;name:string};
const mappingFields=["studentName","studentId","workplaceName","workplaceId","attendedOn","periodStart","periodEnd","attendanceStatus","lessonCount","mode","sourceTimezone","sourceLabel"] as const;
const cls="rounded-lg border border-border bg-background p-2 text-sm w-full";
async function asJson(res:Response){
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error(body.error??"Request failed"),
  {code:typeof body.code==="string"?body.code:undefined});
 return body;
}
export function HistoricalAttendanceImportPanel(){
 const t=useTranslations("historyImport");
  const toUserError=useLocalizedApiError();
 const locale=useLocale();
 const confirm=useConfirm();
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const [stage,setStage]=useState<Stage|null>(null);
 const [mapping,setMapping]=useState<Record<string,string|null>>({});
 const [start,setStart]=useState(""),[end,setEnd]=useState("");
 const [timezone,setTimezone]=useState("Asia/Jerusalem");
 const [resolutions,setResolutions]=useState<Record<string,{studentId?:string;workplaceId?:string}>>({});
 const [preview,setPreview]=useState<Preview|null>(null);
 const [requestKey,setRequestKey]=useState<string|null>(null);
 const [students,setStudents]=useState<Roster[]>([]);
 const [workplaces,setWorkplaces]=useState<Roster[]>([]);
 const [report,setReport]=useState<Record<string,unknown>[]|null>(null);
 const invalidate=()=>{setPreview(null);setRequestKey(null);};
 const loadChoices=useCallback(async()=>{
  try{
   const [studentsRes,workplacesRes]=await Promise.all([
    fetch("/api/students?includeArchived=true&limit=1000",{cache:"no-store"}),
    fetch("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({action:"workplaces.list"}),cache:"no-store"}),
   ]);
   const s=await asJson(studentsRes),w=await asJson(workplacesRes);
   setStudents(s.students??[]);
   setWorkplaces(w.data??[]);
  }catch{/* Missing choices are still explicitly reviewed, never guessed. */}
 },[]);
 useEffect(()=>{void loadChoices();},[loadChoices]);
 async function upload(file:File){
  setBusy(true);setError(null);setMessage(null);invalidate();
  try{
   const form=new FormData();form.append("file",file);
   const result=await asJson(await fetch("/api/import/historical/stage",{
    method:"POST",body:form,
   })) as Stage;
   setStage(result);setMapping({});setResolutions({});
   setMessage(t("stagedNotice"));
  }catch(e){setError(toUserError(e,t("requestFailed")));}
  finally{setBusy(false);}
 }
 const input=()=>({
  stageId:stage?.stageId,schoolYearStart:start,schoolYearEnd:end,
  timezone,mapping,resolutions,
 });
 async function review(){
  if(!stage)return;
  setBusy(true);setError(null);setMessage(null);
  try{
   const result=await asJson(await fetch("/api/import/historical/preview",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(input()),
   })) as Preview;
   setPreview(result);setMapping(result.mapping);setRequestKey(crypto.randomUUID());
   if(!result.canCommit)setMessage(
    t("reviewIssues"));
  }catch(e){invalidate();setError(toUserError(e,t("requestFailed")));}
  finally{setBusy(false);}
 }
 async function commit(){
  if(!stage||!preview?.canCommit||!requestKey)return;
  const approved=await confirm({title:t("confirmTitle"),
   message:t("confirmMessage",{count:preview.previewTotal}),
   confirmLabel:t("importConfirm")});
  if(!approved)return;
  setBusy(true);setError(null);
  try{
   const data=await asJson(await fetch("/api/import/historical/commit",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...input(),previewDigest:preview.previewDigest,
     idempotencyKey:requestKey,confirmed:true}),
   }));
   setMessage(t("imported",{count:data.count}));
   await loadReport();
  }catch(e){setError(toUserError(e,t("requestFailed")));}
  finally{setBusy(false);}
 }
 async function loadReport(){
  try{
   const data=await asJson(await fetch("/api/import/historical/report?limit=50",{cache:"no-store"}));
   setReport(data.records??[]);
  }catch(e){setError(toUserError(e,t("requestFailed")));}
 }
 async function deleteStage(){
  if(!stage)return;
  const approved=await confirm({title:t("deleteTitle"),
   message:t("deleteWarning"),
   confirmLabel:t("deleteConfirm")});
  if(!approved)return;
  setBusy(true);
  try{
   await asJson(await fetch("/api/import/historical/stage",{
    method:"DELETE",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({stageId:stage.stageId}),
   }));
   setStage(null);setPreview(null);setMessage(t("deleted"));
  }catch(e){setError(toUserError(e,t("requestFailed")));}finally{setBusy(false);}
 }
 const setResolution=(row:number,key:"studentId"|"workplaceId",value:string)=>{
  setResolutions(previous=>({...previous,[row]:{
   ...(previous[String(row)]??{}),[key]:value||undefined,
  }}));invalidate();
 };
 return <Card id="historical-attendance-import">
  <h2 className="font-semibold text-lg">{t("title")}</h2>
  <p className="text-sm text-muted mt-1 mb-3">
   {t("description")}
  </p>
  <label className="block text-sm mb-2">
   <span className="font-medium">{t("upload")}</span>
   <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls"
    className={cls+" mt-1"} disabled={busy}
    onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);
     event.currentTarget.value="";}} />
  </label>
  {stage&&<>
   <p className="text-xs text-muted mb-3">
    {t("stageSummary",{filename:stage.filename,count:stage.rowCount,expires:new Date(stage.expiresAt).toLocaleString(locale)})} · {t("reference")} <code dir="ltr">{stage.stageId}</code> {t("chatReference")}
   </p>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
    <label className="text-sm">{t("periodStart")}
     <input type="date" value={start} className={cls}
      onChange={e=>{setStart(e.target.value);invalidate();}}/>
    </label>
    <label className="text-sm">{t("periodEnd")}
     <input type="date" value={end} className={cls}
      onChange={e=>{setEnd(e.target.value);invalidate();}}/>
    </label>
    <label className="text-sm">{t("timezone")}
     <input type="text" value={timezone} className={cls}
      onChange={e=>{setTimezone(e.target.value);invalidate();}}/>
    </label>
   </div>
   <p className="text-xs text-muted mb-2">
    {t("mapHint")}
   </p>
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
    {mappingFields.map((field)=><label key={field} className="text-xs">
     <span>{t(`fields.${field}`)}</span>
     <select className={cls} value={mapping[field]??""}
      onChange={e=>{setMapping(x=>({...x,[field]:e.target.value||null}));invalidate();}}>
      <option value="">{t("notMapped")}</option>
      {stage.headers.map(h=><option key={h} value={h}>{h}</option>)}
     </select>
    </label>)}
   </div>
   <div className="flex flex-wrap gap-2 mb-3">
    <Button type="button" disabled={busy||!start||!end} onClick={()=>void review()}>
     {t("preview")}
    </Button>
    <Button type="button" variant="secondary" disabled={busy}
     onClick={()=>void deleteStage()}>{t("deleteStage")}</Button>
   </div>
  </>}
  {preview&&<section className="border-t border-border pt-3 space-y-3">
   <p className="text-sm font-medium">
    {t("previewSummary",{records:preview.previewTotal,issues:preview.issueCount,state:preview.canCommit?t("ready"):t("notReady")})}
   </p>
   {preview.issues.length>0&&<div className="space-y-2" role="alert">
    {preview.issues.map((issue,i)=><div key={i}
     className="border border-border rounded-lg p-2 text-xs">
     <span className="font-medium">{t("row",{row:issue.row})} </span>{issue.message}
     {(issue.code.includes("STUDENT"))&&<select className={cls}
       value={resolutions[String(issue.row)]?.studentId??""}
       onChange={e=>setResolution(issue.row,"studentId",e.target.value)}>
        <option value="">{t("selectStudent")}</option>
        {students.map(s=><option key={s.id} value={s.id}>{s.name} ({s.id.slice(0,8)})</option>)}
      </select>}
     {(issue.code.includes("WORKPLACE"))&&<select className={cls}
       value={resolutions[String(issue.row)]?.workplaceId??""}
       onChange={e=>setResolution(issue.row,"workplaceId",e.target.value)}>
        <option value="">{t("selectWorkplace")}</option>
        {workplaces.map(w=><option key={w.id} value={w.id}>{w.name} ({w.id.slice(0,8)})</option>)}
      </select>}
    </div>)}
    {preview.issueCount>preview.issues.length&&<p className="text-xs text-muted">
     {t("moreIssues")}
    </p>}
   </div>}
   <div className="overflow-x-auto text-xs">
    <table className="w-full">
     <thead><tr className="text-start border-b border-border">
      <th>{t("sourceRow")}</th><th>{t("studentId")}</th><th>{t("workplaceId")}</th>
      <th>{t("precision")}</th><th>{t("datePeriod")}</th><th>{t("status")}</th><th>{t("count")}</th>
     </tr></thead>
     <tbody>{preview.previewRows.map(r=><tr key={r.sourceRow}
      className="border-b border-border/50">
      <td>{r.sourceRow}</td><td>{r.studentId.slice(0,8)}</td>
      <td>{r.workplaceId.slice(0,8)}</td><td>{r.mode==="dated"?t("dated"):t("aggregate")}</td>
      <td>{r.attendedOn??[r.periodStart,r.periodEnd].join(" – ")}</td>
      <td>{r.attendanceStatus}</td><td>{r.lessonCount}</td>
     </tr>)}</tbody>
    </table>
   </div>
   {preview.canCommit&&<Button type="button" disabled={busy}
     onClick={()=>void commit()}>{t("confirmImport")}</Button>}
  </section>}
  <div className="mt-4">
   <Button type="button" variant="secondary" disabled={busy}
    onClick={()=>void loadReport()}>{t("viewEvidence")}</Button>
   {report&&<div className="mt-2 text-xs">
    <p>{t("showingRecords",{count:report.length})}</p>
    {report.slice(0,12).map((r,i)=><p key={i} className="border-b border-border py-1">
     {String(r.mode)} · {String(r.attendance_status)} ·
     {r.mode==="dated"?String(r.attended_on):
      String(r.period_start)+" – "+String(r.period_end)} ·
     {t("recordCount",{count:Number(r.lesson_count),row:String(r.source_row)})}
    </p>)}
   </div>}
  </div>
  {message&&<p role="status" className="text-sm text-success mt-3">{message}</p>}
  {error&&<p role="alert" className="text-sm text-error mt-3">{error}</p>}
 </Card>;
}
