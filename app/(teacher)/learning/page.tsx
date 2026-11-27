import Link from "next/link";
import { dailyHomeworkFocusInput, teacherDailyHomeworkFocus } from "@/lib/server/daily-homework";
import {getTranslations} from "next-intl/server";
import {createClient} from "@/lib/supabase/server";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import { LearningMaterialsCatalog } from "@/components/teacher/LearningMaterialsCatalog";
import { TrainingHomeworkPanel } from "@/components/teacher/TrainingHomeworkPanel";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { LichessConnectionPanel } from "@/components/teacher/LichessConnectionPanel";
import { LichessStudyExplorer } from "@/components/teacher/LichessStudyExplorer";
import { LichessPuzzlePublisher } from "@/components/teacher/LichessPuzzlePublisher";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";
import { StudyChapterEvidencePanel } from "@/components/teacher/StudyChapterEvidencePanel";
import { PuzzleSeriesPanel } from "@/components/teacher/PuzzleSeriesPanel";
import { FenReviewPanel } from "@/components/teacher/FenReviewPanel";
import {StudyPreferencesPanel} from "@/components/teacher/StudyPreferencesPanel";

export async function generateMetadata(){
  const t=await getTranslations("nav");
  return {title:t("learning")};
}

type LearningSearch = {dailyHomework?:string|string[];dueThrough?:string|string[]};

export default async function LearningPage({searchParams}:{searchParams:Promise<LearningSearch>}) {
  const t=await getTranslations("nav");
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return null;
  const {dailyHomework,dueThrough}=await searchParams;
  if(dailyHomework!==undefined || dueThrough!==undefined) {
    const home=await getTranslations("dashboard");
    const input=dailyHomeworkFocusInput.safeParse({assignmentId:dailyHomework,dueThrough});
    const result=input.success
      ? await teacherDailyHomeworkFocus(db,user.id,input.data)
      : {status:"not_actionable" as const};
    const back=input.success ? "/dashboard?date="+input.data.dueThrough+"#daily-homework" : "/dashboard";
    return <div className="ccp-focused-page">
      <section aria-labelledby="daily-homework-focus" className="space-y-4">
        <h1 id="daily-homework-focus" className="text-2xl font-bold">{home("dailyHomeworkFocus")}</h1>
        {result.status==="ready" ? <>
          <p className="font-semibold"><bdi dir="auto">{result.materialTitle ?? home("dailyHomeworkUnknownMaterial")}</bdi></p>
          <p>{home("dailyHomeworkLearner")}{" "}<bdi dir="auto">{result.learnerName}</bdi></p>
          <p>{home("dailyHomeworkDue")}{" "}<time dateTime={result.dueOn}>{result.dueOn}</time></p>
          <p>{home(result.reason==="SUBMISSION_AWAITING_REVIEW" ? "dailyHomeworkReview"
            : result.reason==="REVIEW_NEEDS_WORK" ? "dailyHomeworkNeedsWork"
            : result.reason==="DUE_AWAITING_SUBMISSION" ? "dailyHomeworkAwaiting" : "dailyHomeworkEvidenceLimit")}</p>
        </> : <p role="status">{home(result.status==="workplace_scope_unavailable" ? "dailyHomeworkAllOnly"
          : result.status==="unavailable" ? "dailyHomeworkUnavailable" : "dailyHomeworkNotActionable")}</p>}
        <Link className="text-primary underline" href={back}>{home("dailyHomeworkBack")}</Link>
      </section>
    </div>;
  }
  const {selectedWorkplaceId:workplaceId,workplaces}=await teacherWorkplaceContextGet(db,user.id);
  const scope=workplaceId??"all";
  const materials=await getTranslations("materialCatalog");
  const lichessName="Lichess";
  return <div className="space-y-6">
    <h1 className="text-2xl font-bold ccp-mobile-sr-only">{t("learning")}</h1>
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label={t("learning")}>
      <a className="min-h-11 content-center rounded-lg px-3 text-primary" href="#material-library">{materials("title")}</a>
      <a className="min-h-11 content-center rounded-lg px-3 text-primary" href="#lichess-library">{lichessName}</a>
      <a className="min-h-11 content-center rounded-lg px-3 text-primary" href="#learning-evidence">{materials("teachingEvidence")}</a>
    </nav>
    <div id="material-library" className="scroll-mt-24"><LearningMaterialsCatalog /></div>
    <section id="lichess-library" className="scroll-mt-24 space-y-5 border-t border-border pt-6">
      <h2 className="text-xl font-semibold">{lichessName}</h2>
      <LichessConnectionPanel /><LichessStudyExplorer /><StudyPreferencesPanel /><StudyChapterEvidencePanel /><PuzzleSeriesPanel /><FenReviewPanel /><LichessPuzzlePublisher />
    </section>
    <section id="learning-evidence" className="scroll-mt-24 space-y-5 border-t border-border pt-6">
      <h2 className="text-xl font-semibold">{materials("teachingEvidence")}</h2>
      <TrainingHomeworkPanel key={"homework:"+scope} workplaceId={workplaceId} /><ChessLearningPanel key={"learning:"+scope} workplaceId={workplaceId} />
      <MaterialHistoryPanel key={"materials:"+scope} initialWorkplaceId={workplaceId} initialWorkplaces={workplaces} />
    </section>
  </div>;
}
