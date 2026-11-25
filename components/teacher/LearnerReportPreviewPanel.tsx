"use client";

import {useId,useState,useSyncExternalStore,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import {localeDetails,locales,supportedLocale} from "@/i18n/locales";
import {messagesFor} from "@/i18n/messages";
import type {LearnerReportPreview} from "@/lib/server/learner-report-preview";

const hydrationSubscribe=()=>()=>{};
const clientReady=()=>true;
const serverReady=()=>false;

export function LearnerReportPreviewPanel({studentId,workplaces}:{
  studentId:string;workplaces:{id:string;name:string}[];
}){
  const t=useTranslations("learnerReportPreview");
  const appLocale=supportedLocale(useLocale())??"en";
  const id=useId();
  // The server-rendered form cannot submit before the client handler attaches.
  const ready=useSyncExternalStore(hydrationSubscribe,clientReady,serverReady);
  const [result,setResult]=useState<LearnerReportPreview|null>(null);
  const [error,setError]=useState<"invalid"|"range"|"unavailable"|null>(null);
  const [pending,setPending]=useState(false);

  function reset(){setResult(null);setError(null);}
  async function preview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const query=new URLSearchParams();
    for(const name of ["workplaceId","from","to","outputLocale"])
      query.set(name,String(form.get(name)??""));
    reset();
    setPending(true);
    try{
      const response=await fetch("/api/students/"+encodeURIComponent(studentId)+"/report-preview?"+query,
        {cache:"no-store"});
      if(!response.ok){
        setError(response.status===400?"invalid":response.status===413?"range":"unavailable");
        return;
      }
      setResult(await response.json());
    }catch{setError("unavailable");}
    finally{setPending(false);}
  }

  const candidate=result?.candidate;
  const output=candidate?messagesFor(candidate.outputLocale).learnerReportPreview:null;
  const info=candidate?localeDetails[candidate.outputLocale]:null;
  const date=info?new Intl.DateTimeFormat(info.intl,{dateStyle:"medium",timeZone:"UTC"}):null;
  const displayDate=(value:string)=>date?.format(new Date(value+"T12:00:00Z"));
  const control="min-w-0 w-full rounded border border-border bg-background px-2 py-1 text-foreground";
  return (
    <details className="mb-6 rounded-lg border border-border p-4">
      <summary className="cursor-pointer font-semibold">{t("title")}</summary>
      <p id={id+"-help"} className="mt-2 text-sm text-muted">{t("noSharing")}</p>
      {workplaces.length===0?<p className="mt-2 text-sm text-muted">{t("noWorkplaces")}</p>:(
        <form className="mt-3" onSubmit={preview} onChange={reset} aria-describedby={id+"-help"} aria-busy={pending}>
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={!ready||pending}>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("workplace")}
              <select name="workplaceId" defaultValue="" required className={control}>
                <option value="" disabled>{t("chooseWorkplace")}</option>
                {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("outputLanguage")}
              <select name="outputLocale" defaultValue={appLocale} className={control}>
                {locales.map(locale=><option key={locale} value={locale}>{localeDetails[locale].name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("from")}
              <input type="date" name="from" required className={control}/>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("to")}
              <input type="date" name="to" required className={control}/>
            </label>
            <button type="submit" className="w-fit max-w-full rounded border border-border px-3 py-2 text-sm">
              {pending?t("loading"):t("review")}
            </button>
          </fieldset>
        </form>
      )}
      {error&&<p className="mt-2 text-sm text-muted" role="alert">{t(error)}</p>}
      <div aria-live="polite" aria-atomic="false">
        {candidate&&output&&info&&(
          <section className="mt-3 border-t border-border pt-3" aria-labelledby={id+"-result"}
            lang={candidate.outputLocale} dir={info.dir}>
            <h3 id={id+"-result"} className="font-semibold">{output.resultTitle}</h3>
            <p className="text-sm">{output.from}: {displayDate(candidate.from)} · {output.to}: {displayDate(candidate.to)}</p>
            <p className="mt-1 text-sm text-muted">{output.dateBasis}</p>
            {candidate.records.length===0?<p className="mt-2 text-sm">{output.noRecords}</p>:(
              <ul className="mt-2 list-disc ps-5 text-sm">
                {candidate.records.map((row,i)=>(
                  <li key={row.localDate+"-"+i}>{displayDate(row.localDate)}: {output.outcomes[row.attendance]}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
