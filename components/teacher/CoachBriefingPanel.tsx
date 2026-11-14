"use client";

import {useState} from "react";

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
  const [briefing,setBriefing]=useState<Briefing|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function load(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/coaching/briefing?"+
        new URLSearchParams({studentId,limit:"20"}),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Unable to load coaching briefing");
      setBriefing(data as Briefing);
    }catch(e){setError(e instanceof Error?e.message:"Briefing unavailable");}
    finally{setBusy(false);}
  }
  return <section className="mb-8 rounded-xl border border-border p-4 space-y-4"
      aria-label="Student next lesson briefing">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-lg font-semibold">Prepare the next lesson</h2>
        <p className="text-sm text-muted">Factual teaching memory, pending work and verified observations. Unknown results are not AI-generated.</p>
      </div>
      <button type="button" disabled={busy} onClick={()=>{void load();}}
        className="rounded-lg bg-primary px-3 py-2 text-white font-semibold disabled:opacity-50">
        {busy?"Preparing…":briefing?"Refresh briefing":"Prepare briefing"}
      </button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {briefing&&<div className="space-y-4 text-sm">
      <p className="text-muted">History {briefing.range.from} – {briefing.range.to} · {briefing.range.timezone}</p>
      {briefing.student.teacherGoals&&<p><strong>Coach-recorded goals:</strong> {briefing.student.teacherGoals}</p>}
      <div>
        <h3 className="font-semibold">Recent lessons ({briefing.lessonHistory.total})</h3>
        {briefing.lessonHistory.entries.length===0?<p className="text-muted">No recorded lessons in this period.</p>:
          <ul className="list-disc pl-5 space-y-1">
            {briefing.lessonHistory.entries.slice(0,10).map(l=><li key={l.id}>
              {new Date(l.startsAt).toLocaleDateString()} · {l.durationMinutes} min ·
              {" "}{l.delivered?"Teaching evidenced":l.status+" (not evidenced)"} <span className="text-xs text-muted">({l.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">Explicitly recorded material history ({briefing.materialCoverage.total})</h3>
        {briefing.materialCoverage.entries.length===0?<p className="text-muted">No coverage recorded yet.</p>:
          <ul className="list-disc pl-5 space-y-1">
            {briefing.materialCoverage.entries.slice(0,10).map(m=><li key={m.id}>
              {m.label||"Resource"} · {m.stage} · {m.occurredOn} <span className="text-xs text-muted">({m.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">Homework ({briefing.homework.total})</h3>
        {briefing.homework.entries.length===0?<p className="text-muted">No assignments recorded yet.</p>:
          <ul className="list-disc pl-5 space-y-1">
            {briefing.homework.entries.slice(0,10).map(h=><li key={h.id}>
              {h.material?.title??"Unspecified material"}{h.dueOn?" · Due "+h.dueOn:""}
              {h.needsCoachReview?" · Coach review needed":h.reviews.length?" · Reviewed":" · Not reviewed"}
              {h.hasRecordedCompletion?" · Completion recorded":" · Completion not evidenced"}
              {h.instructions&&<p className="text-muted">{h.instructions}</p>}
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">Explicit training plans and goals ({briefing.trainingPlans.total})</h3>
        {briefing.trainingPlans.entries.length===0?
          <p className="text-muted">No coach-authored training plan is recorded.</p>:
          <ul className="list-disc pl-5 space-y-2">
            {briefing.trainingPlans.entries.map(plan=><li key={plan.id}>
              {plan.title} · {plan.status} · revision {plan.revision}
              <ul className="list-disc pl-5">
                {plan.goals.map(goal=><li key={goal.id}>
                  {goal.title} · {goal.status}
                  {goal.targetDate?" · Target "+goal.targetDate:""}
                  {goal.coachEvidence?" · Coach evidence: "+goal.coachEvidence:" · No achievement evidence recorded"}
                </li>)}
              </ul>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">Coach-approved chess observations</h3>
        {briefing.verifiedObservations.length===0?<p className="text-muted">No verified observations.</p>:
          <ul className="list-disc pl-5 space-y-1">
            {briefing.verifiedObservations.slice(0,10).map(o=><li key={o.id}>
              {o.observation} · {o.observedAt.slice(0,10)} <span className="text-xs text-muted">({o.id})</span>
            </li>)}
          </ul>}
      </div>
      <div>
        <h3 className="font-semibold">Known unknowns and safeguards</h3>
        <ul className="list-disc pl-5 space-y-1 text-muted">
          {briefing.unknowns.map((u,i)=><li key={i}>{u}</li>)}
        </ul>
      </div>
    </div>}
  </section>;
}
