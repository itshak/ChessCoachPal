import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {Card} from "@/components/ui/card";
import type {teacherLearnerEvidence} from "@/lib/server/learner-evidence";

type Evidence=Awaited<ReturnType<typeof teacherLearnerEvidence>>;
export async function LearnerEvidencePanel({evidence}:{evidence:Evidence|null}){
 const t=await getTranslations("learnerEvidence");
 const workplace=(name:string|null)=>name??t("unknownWorkplace");
 return <section id="learner-evidence" aria-labelledby="learner-evidence-heading" className="mb-8">
  <Card>
   <h2 id="learner-evidence-heading" className="text-lg font-semibold">{t("heading")}</h2>
   {!evidence?<p className="mt-3 text-sm text-muted">{t("unavailable")}</p>:<>
    {evidence.archived&&<p className="mt-2 text-sm">{t("archived")}</p>}
    <h3 className="mt-4 font-semibold">{t("completedHeading")}</h3>
    <p className="mt-1 text-sm text-muted">{evidence.completed.total===0?t("noCompleted"):
     t("showing",{visible:evidence.completed.records.length,total:evidence.completed.total})}</p>
    {evidence.completed.records.length>0&&<ul className="mt-2 list-disc space-y-1 ps-6 text-sm">
     {evidence.completed.records.map(r=><li key={r.sessionId}>
      {r.localDate?<time dateTime={r.localDate}>{r.localDate}</time>:
       <time dateTime={r.startsAt}>{t("recordedUtc",{timestamp:new Date(r.startsAt).toISOString().slice(0,16).replace("T"," ")})}</time>}
      {" · "}{workplace(r.workplace.name)}{" · "}{t(`status.${r.attendance}`)}
     </li>)}
    </ul>}
    <h3 className="mt-4 font-semibold">{t("importedHeading")}</h3>
    <p className="mt-1 text-sm text-muted">{t("importedExplanation")}</p>
    <p className="mt-1 text-sm">{evidence.imported.totalRows===0?t("noImported"):
     t("importedTotals",{dated:evidence.imported.datedObservations,aggregate:evidence.imported.aggregateSourceRows,
      declared:evidence.imported.aggregateDeclaredLessons})}</p>
    {evidence.imported.records.length>0&&<>
     <p className="mt-1 text-sm text-muted">{t("showing",{visible:evidence.imported.records.length,total:evidence.imported.totalRows})}</p>
     <ul className="mt-2 list-disc space-y-1 ps-6 text-sm">
      {evidence.imported.records.map(r=><li key={r.evidenceId}>
       {r.kind==="dated"?t("datedRow",{date:r.date??t("unknownDate"),status:t(`status.${r.attendance}`)}):
        t("aggregateRow",{start:r.periodStart??t("unknownDate"),end:r.periodEnd??t("unknownDate"),count:r.declaredLessons})}
       {" · "}{workplace(r.workplace.name)}{" · "}{t("sourceRow",{row:r.sourceRow})}
      </li>)}
     </ul>
    </>}
    <Link href="/account#historical-attendance-import" className="mt-3 inline-block text-sm text-primary hover:underline">
     {t("reviewImport")}
    </Link>
   </>}
  </Card>
 </section>;
}
