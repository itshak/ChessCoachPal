"use client";

import {useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";

type Study={id:string;name:string;createdAt:number|null;updatedAt:number|null};
type Chapter={
 studyId:string;studyName:string;chapterNumber:number;chapterName:string;
 chapterUrl:string;eco:string|null;opening:string|null;fen:string|null;
};
type Result={
 username:string;studies:Study[];matches:Chapter[];chapterCount:number;truncated:boolean;
};

/** Both the website and MCP use the same server-only Lichess study index. */
export function LichessStudyExplorer(){
 const t=useTranslations("lichessExplorer");
 const [query,setQuery]=useState("");
 const [studyId,setStudyId]=useState("");
 const [chapterNumber,setChapterNumber]=useState("");
 const [result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function search(event?:FormEvent){
  event?.preventDefault();
  setBusy(true);setError("");
  try{
   const params=new URLSearchParams();
   if(query.trim())params.set("query",query.trim());
   if(studyId.trim())params.set("studyId",studyId.trim());
   if(chapterNumber.trim())params.set("chapterNumber",chapterNumber.trim());
   const res=await fetch("/api/lichess/studies?"+params.toString(),{
    credentials:"same-origin",cache:"no-store",
   });
   const response=await res.json();
   if(!res.ok)throw new Error(response.error??t("searchFailed"));
   setResult(response as Result);
  }catch(e){
   setResult(null);
   setError(e instanceof Error?e.message:t("searchFailed"));
  }finally{setBusy(false);}
 }
 async function openStudy(id:string){
  setStudyId(id);setChapterNumber("");setQuery("");
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/lichess/studies?studyId="+encodeURIComponent(id),{
    credentials:"same-origin",cache:"no-store",
   });
   const response=await res.json();
   if(!res.ok)throw new Error(response.error??t("loadFailed"));
   setResult(response as Result);
  }catch(e){setResult(null);setError(e instanceof Error?e.message:t("unavailable"));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("aria")}
  className="space-y-3 rounded-xl border border-border bg-surface p-4">
  <div>
   <h2 className="text-xl font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">
    {t("description")}
   </p>
  </div>
  <form className="grid grid-cols-1 gap-3 sm:grid-cols-4" onSubmit={e=>void search(e)}>
   <label className="text-sm sm:col-span-2">{t("keywords")}
    <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     maxLength={120} placeholder={t("keywordExample")}
     className="mt-1 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm">{t("studyId")}
    <input value={studyId} onChange={e=>setStudyId(e.target.value)}
     maxLength={8} pattern="[a-zA-Z0-9]{8}" placeholder={t("eightCharacters")}
     className="mt-1 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm">{t("chapterNumber")}
    <input type="number" min={1} max={64} value={chapterNumber}
     onChange={e=>setChapterNumber(e.target.value)} placeholder="32"
     disabled={!studyId.trim()}
     className="mt-1 w-full min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
    {busy?t("searching"):t("search")}
   </button>
  </form>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {result&&<div className="space-y-2">
   <p className="text-xs text-muted">{t("connected")} <bdi dir="ltr">{result.username}</bdi>
    {result.truncated?t("truncated"):""}
   </p>
   {!!result.studies.length&&<ul className="space-y-1">
    {result.studies.map(study=><li key={study.id}>
     <button type="button" onClick={()=>void openStudy(study.id)}
      className="text-sm text-primary underline text-start">
      <bdi dir="auto">{study.name}</bdi> (<bdi dir="ltr">{study.id}</bdi>)
     </button>
    </li>)}
   </ul>}
   {!!result.matches.length&&<ol className="space-y-2">
    {result.matches.map(chapter=><li key={chapter.studyId+"-"+chapter.chapterNumber}
      className="rounded-md border border-border px-3 py-2 text-sm">
     <a href={chapter.chapterUrl} target="_blank" rel="noopener noreferrer"
      className="font-semibold text-primary underline">
      {t("chapter",{number:chapter.chapterNumber})}: <bdi dir="auto">{chapter.chapterName}</bdi>
     </a>
     {(chapter.opening||chapter.eco)&&<p className="text-muted">
      {[chapter.eco,chapter.opening].filter(Boolean).join(" · ")}
     </p>}
     {chapter.fen&&<p className="break-all font-mono text-xs text-muted">
      {t("initialFen")} <bdi dir="ltr">{chapter.fen}</bdi>
     </p>}
    </li>)}
   </ol>}
   {!result.studies.length&&!result.matches.length&&
    <p className="text-sm text-muted">{t("noMatches")}</p>}
  </div>}
 </section>;
}
