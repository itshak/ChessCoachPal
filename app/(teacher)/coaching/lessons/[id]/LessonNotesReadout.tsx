"use client";
import {useState,useRef,useEffect} from "react";
import {useTranslations} from "next-intl";

type Note={id:string;student_id:string|null;body:string;private_body?:string;shared_with_contacts:boolean;emailed_at:string|null};
export function LessonNotesReadout({sessionId,initialNotes,participants}:{sessionId:string;initialNotes:Note[]|null;participants:{id:string;name:string}[]}){
 const t=useTranslations("lessonHistory"),c=useTranslations("calendar"),n=useTranslations("lessonNotes"),common=useTranslations("common");
 const [privateNotes,setPrivateNotes]=useState<Note[]|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 async function reveal(){
  const attempt=++generation.current;setBusy(true);setError(false);
  try{
   const res=await fetch("/api/coaching/sessions/"+encodeURIComponent(sessionId)+"/notes?includePrivate=true&confirmed=true",{cache:"no-store"});
   if(!res.ok)throw Error();
   const rows=await res.json() as Note[];
   if(attempt===generation.current)setPrivateNotes(rows);
  }catch{if(attempt===generation.current)setError(true);}
  finally{if(attempt===generation.current)setBusy(false);}
 }
 const notes=privateNotes??initialNotes;
 return <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 space-y-3" aria-label={n("title")}>
  <div className="flex flex-wrap justify-between gap-3 items-center">
   <h2 className="text-lg font-semibold">{n("title")}</h2>
   <button type="button" className="min-h-11 rounded-lg border border-border px-3 text-primary" disabled={busy}
    aria-expanded={privateNotes!==null} onClick={()=>{if(privateNotes){generation.current++;setPrivateNotes(null);setError(false);}else void reveal();}}>
    {busy?common("loading"):privateNotes?t("hidePrivate"):t("showPrivate")}
   </button>
  </div>
  {error&&<p role="alert">{t("notesUnavailable")}</p>}
  {notes===null?<p role="status">{t("notesUnavailable")}</p>:notes.length===0?<p className="text-muted">{n("empty")}</p>:<div className="space-y-3">
   {notes.map(note=><article key={note.id} className="rounded-lg border border-border bg-background p-3 space-y-3">
    <h3 className="font-semibold"><bdi dir="auto">{note.student_id?participants.find(p=>p.id===note.student_id)?.name??common("unknown"):t("sessionWide")}</bdi></h3>
    {note.body&&<div className="space-y-1">
     <h4 className="text-sm font-semibold">{c("familyNote")}</h4>
     <p className="text-sm text-muted">{t(note.shared_with_contacts?"noteMarked":"noteNotMarked")}{note.emailed_at&&<>{" · "}{n("emailed")}</>}</p>
     <p className="whitespace-pre-wrap break-words" dir="auto">{note.body}</p>
    </div>}
    {privateNotes&&note.private_body&&<div className="rounded-lg border border-border p-3 space-y-1">
     <h4 className="text-sm font-semibold">{c("privateNote")}</h4>
     <p className="whitespace-pre-wrap break-words" dir="auto">{note.private_body}</p>
    </div>}
   </article>)}
  </div>}
 </section>;
}
