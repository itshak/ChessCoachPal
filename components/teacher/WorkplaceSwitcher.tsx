"use client";

import {useEffect,useId,useState} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";

type Workplace={id:string;name:string};
/** Persisted teacher preference only; it never authorizes access to records. */
export function WorkplaceSwitcher({selectedWorkplaceId,selectionWasStale,workplaces}:{
 selectedWorkplaceId:string|null;selectionWasStale:boolean;workplaces:Workplace[];
}){
  const t=useTranslations("nav");
  const router=useRouter();
  const fallbackId=useId();
  const [current,setCurrent]=useState(selectedWorkplaceId);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{setCurrent(selectedWorkplaceId);setError(false);},[selectedWorkplaceId]);
  async function change(selected:string){
    if(pending)return;
    const desired=selected==="all"?null:selected;
    const previous=current;
    if(previous===desired)return;
    setPending(true);setError(false);
    try{
      const response=await fetch("/api/teacher/workplace-context",{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({selectedWorkplaceId:desired,
          expectedSelectedWorkplaceId:previous,confirmed:true}),
      });
      if(!response.ok)throw new Error("CONTEXT_CHANGE_FAILED");
      const data=await response.json() as {selectedWorkplaceId:string|null};
      setCurrent(data.selectedWorkplaceId);
      router.refresh();
    }catch{
      // Server owns the selection; reload rather than keeping stale UI state.
      setError(true);setCurrent(previous);router.refresh();
    }finally{setPending(false);}
  }
  return <div className="min-w-0 flex flex-col items-start gap-0.5">
    <label htmlFor="global-workplace-switch" className="sr-only">{t("workplaceFilter")}</label>
    <select id="global-workplace-switch" value={current??"all"}
      onChange={event=>void change(event.target.value)} disabled={pending}
      aria-busy={pending} aria-describedby={selectionWasStale?fallbackId:undefined} title={t("workplaceFilter")}
      className="w-28 sm:w-36 lg:w-40 truncate rounded-lg border border-border bg-surface text-foreground px-2 py-1.5 text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60">
      <option value="all">{t("allWorkplaces")}</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
    {selectionWasStale&&<span id={fallbackId} className="max-w-40 text-[10px] text-muted" role="status">
      {t("workplaceFilterFallback")}
    </span>}
    {error&&<span className="text-[10px] text-error" role="alert">{t("workplaceFilterFailed")}</span>}
  </div>;
}
