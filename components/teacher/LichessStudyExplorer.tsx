"use client";

import {useState,type FormEvent} from "react";

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
   if(!res.ok)throw new Error(response.error??"Lichess study search failed");
   setResult(response as Result);
  }catch(e){
   setResult(null);
   setError(e instanceof Error?e.message:"Lichess study search failed");
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
   if(!res.ok)throw new Error(response.error??"Could not load study chapters");
   setResult(response as Result);
  }catch(e){setResult(null);setError(e instanceof Error?e.message:"Study unavailable");}
  finally{setBusy(false);}
 }
 return <section aria-label="Lichess study and chapter search"
  className="space-y-3 rounded-xl border border-border bg-surface p-4">
  <div>
   <h2 className="text-xl font-semibold">Find Lichess study chapters</h2>
   <p className="text-sm text-muted">
    Search your connected studies by title. Select a study to inspect its PGN
    metadata, including the 32nd chapter. Private study tokens never leave this server.
   </p>
  </div>
  <form className="grid gap-3 sm:grid-cols-4" onSubmit={e=>void search(e)}>
   <label className="text-sm sm:col-span-2">Study or chapter keywords
    <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     maxLength={120} placeholder="e.g. rook endgame"
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm">Study ID (optional)
    <input value={studyId} onChange={e=>setStudyId(e.target.value)}
     maxLength={8} pattern="[a-zA-Z0-9]{8}" placeholder="Eight characters"
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <label className="text-sm">Chapter number
    <input type="number" min={1} max={64} value={chapterNumber}
     onChange={e=>setChapterNumber(e.target.value)} placeholder="32"
     disabled={!studyId.trim()}
     className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
    {busy?"Searching…":"Search studies"}
   </button>
  </form>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {result&&<div className="space-y-2">
   <p className="text-xs text-muted">Connected account: {result.username}
    {result.truncated?" · More results exist; narrow your search":""}
   </p>
   {!!result.studies.length&&<ul className="space-y-1">
    {result.studies.map(study=><li key={study.id}>
     <button type="button" onClick={()=>void openStudy(study.id)}
      className="text-sm text-primary underline text-left">
      {study.name} ({study.id})
     </button>
    </li>)}
   </ul>}
   {!!result.matches.length&&<ol className="space-y-2">
    {result.matches.map(chapter=><li key={chapter.studyId+"-"+chapter.chapterNumber}
      className="rounded-md border border-border px-3 py-2 text-sm">
     <a href={chapter.chapterUrl} target="_blank" rel="noopener noreferrer"
      className="font-semibold text-primary underline">
      Chapter {chapter.chapterNumber}: {chapter.chapterName}
     </a>
     {(chapter.opening||chapter.eco)&&<p className="text-muted">
      {[chapter.eco,chapter.opening].filter(Boolean).join(" · ")}
     </p>}
     {chapter.fen&&<p className="break-all font-mono text-xs text-muted">
      Initial FEN: {chapter.fen}
     </p>}
    </li>)}
   </ol>}
   {!result.studies.length&&!result.matches.length&&
    <p className="text-sm text-muted">No matching studies or chapters found.</p>}
  </div>}
 </section>;
}
