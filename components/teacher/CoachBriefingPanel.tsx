"use client";

import {useState} from "react";
import {useLocale,useTranslations} from "next-intl";

type Briefing={
  student:{id:string;name:string;archived:boolean;chessStrength:number|null;teacherGoals:string};
  range:{from:string;to:string;timezone:string};
  lessonHistory:{entries:Array<{id:string;startsAt:string;durationMinutes:number;status:string;delivered:boolean}>;total:number};
  materialCoverage:{entries:Array<{id:string;label:string|null;stage:string;occurredOn:string}>;total:number};
  homework:{entries:Array<{
    id:string;instructions:string;dueOn:string|null;
    material:{id:string;title:string;kind:string}|null;
    hasRecordedCompletion:boolean;needsCoachReview:boolean;
    attempts:Array<{id:string;outcome:string}>;
    reviews:Array<{id:string;verdict:string}>;
  }>;total:number};
  trainingPlans:{entries:Array<{
    id:string;title:string;status:string;revision:number;
    goals:Array<{id:string;title:string;status:string;targetDate:string|null;coachEvidence:string|null}>;
  }>;total:number};
  verifiedObservations:Array<{id:string;observation:string;observedAt:string}>;
  unknowns:string[];
};

export function CoachBriefingPanel({studentId}:{studentId:string}){
  const t=useTranslations("briefing");
  const locale=useLocale();
  const date=(iso:string,timezone="UTC")=>{const d=new Date(iso.length===10?iso+"T12:00:00.000Z":iso);return Number.isNaN(d.getTime())?iso:new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:timezone}).format(d);};
  const lessonStatus=(status:string)=>status==="scheduled"?t("scheduled"):status==="completed"?t("completed"):status==="cancelled"?t("cancelled"):status;
  const materialStage=(status:string)=>status==="assigned"?t("assigned"):status==="studied"?t("studied"):status==="completed"?t("completed"):status;
  const [briefing,setBriefing]=useState<Briefing|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function load(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/coaching/briefing?"+
        new URLSearchParams({studentId,limit:"20"}),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("loadError"));
      setBriefing(data as Briefing);
    }catch(e){setError(e instanceof Error?e.message:t("unavailable"));}
    finally{setBusy(false);}
  }
  return <section className="mb-8 rounded-xl border border-border p-4 space-y-4"
      aria-label={t("aria")}>
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("description")}</p>
      </div>
      <button type="button" disabled={busy} onClick={()=>{void load();}}
        className="rounded-lg bg-primary px-3 py-2 text-white font-semibold disabled:opacity-50">
        {busy?t("preparing"):briefing?t("refresh"):t("prepare")}
      </button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {briefing&&<div className="space-y-4 text-sm">
      <p className="text-muted">{t("history",{from:date(briefing.range.from),to:date(briefing.range.to),timezone:briefing.range.timezone})}</p>
      {briefing.student.teacherGoals&&<p><strong>{t("coachGoals")}</strong> <bdi dir="auto">{briefing.student.teacherGoals}</bdi></p>}
      <div>
        <h3 className="font-semibold">{t("recentLessons",{count:briefing.lessonHistory.total})}</h3>
        {briefing.lessonHistory.entries.length===0?<p className="text-muted">{t("noLessons")}</p>:
          <ul className="list-disc ps-5 space-y-1">
            {briefing.lessonHistory.entries.slice(0,10).map(l=><li key={l.id}>
              {date(l.startsAt,briefing.range.timezone)} · {t("minutes",{count:l.durationMinutes})} ·
              {" "}{l.delivered?t("teachingEvidenced"):t("notEvidenced",{status:lessonStatus(l.status)})} <span className="text-xs text-muted">({l.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">{t("materialHistory",{count:briefing.materialCoverage.total})}</h3>
        {briefing.materialCoverage.entries.length===0?<p className="text-muted">{t("noCoverage")}</p>:
          <ul className="list-disc ps-5 space-y-1">
            {briefing.materialCoverage.entries.slice(0,10).map(m=><li key={m.id}>
              <bdi dir="auto">{m.label||t("resource")}</bdi> · {materialStage(m.stage)} · {date(m.occurredOn)} <span className="text-xs text-muted">({m.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">{t("homework",{count:briefing.homework.total})}</h3>
        {briefing.homework.entries.length===0?<p className="text-muted">{t("noAssignments")}</p>:
          <ul className="list-disc ps-5 space-y-1">
            {briefing.homework.entries.slice(0,10).map(h=><li key={h.id}>
              <bdi dir="auto">{h.material?.title??t("unspecifiedMaterial")}</bdi>{h.dueOn?t("due",{date:date(h.dueOn)}):""}
              {h.needsCoachReview?t("reviewNeeded"):h.reviews.length?t("reviewed"):t("notReviewed")}
              {h.hasRecordedCompletion?t("completionRecorded"):t("completionNotEvidenced")}
              {h.instructions&&<p className="text-muted">{h.instructions}</p>}
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">{t("trainingPlans",{count:briefing.trainingPlans.total})}</h3>
        {briefing.trainingPlans.entries.length===0?
          <p className="text-muted">{t("noPlans")}</p>:
          <ul className="list-disc ps-5 space-y-2">
            {briefing.trainingPlans.entries.map(plan=><li key={plan.id}>
              <bdi dir="auto">{plan.title}</bdi> · <span dir="auto">{plan.status}</span> · {t("revision",{revision:plan.revision})}
              <ul className="list-disc ps-5">
                {plan.goals.map(goal=><li key={goal.id}>
                  <bdi dir="auto">{goal.title}</bdi> · <span dir="auto">{goal.status}</span>
                  {goal.targetDate?t("target",{date:date(goal.targetDate)}):""}
                  {goal.coachEvidence?<>{t("coachEvidence")} <bdi dir="auto">{goal.coachEvidence}</bdi></>:t("noAchievementEvidence")}
                </li>)}
              </ul>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">{t("observations")}</h3>
        {briefing.verifiedObservations.length===0?<p className="text-muted">{t("noObservations")}</p>:
          <ul className="list-disc ps-5 space-y-1">
            {briefing.verifiedObservations.slice(0,10).map(o=><li key={o.id}>
              <bdi dir="auto">{o.observation}</bdi> · {date(o.observedAt,briefing.range.timezone)} <span className="text-xs text-muted">({o.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">{t("unknowns")}</h3>
        <ul className="list-disc ps-5 space-y-1 text-muted">
          {briefing.unknowns.map((u,i)=><li key={i}>{u}</li>)}
        </ul>
      </div>
    </div>}
  </section>;
}
