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
  const {selectedWorkplaceId:workplaceId,workplaces}=await teacherWorkplaceContextGet(db,user.id);
  const {dailyHomework,dueThrough}=await searchParams;
  if(dailyHomework!==undefined || dueThrough!==undefined) {
    const home=await getTranslations("dashboard");
    const input=dailyHomeworkFocusInput.safeParse({dailyHomework,dueThrough});
    const result=input.success
      ? await teacherDailyHomeworkFocus(db,user.id,workplaceId,input.data)
      : {status:"not_actionable" as const};
    const back=input.success ? "/dashboard?date="+input.data.dueThrough+"#daily-homework" : "/dashboard";
    return <div className="max-w-3xl mx-auto px-4 py-8">
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
  const scope=workplaceId??"all";
  return <div className="max-w-6xl mx-auto px-4 py-8">
    <h1 className="text-2xl font-bold mb-6">{t("learning")}</h1>
    <div className="space-y-8"><LearningMaterialsCatalog /><TrainingHomeworkPanel key={"homework:"+scope} workplaceId={workplaceId} /><LichessConnectionPanel /><LichessStudyExplorer /><StudyPreferencesPanel />
      <StudyChapterEvidencePanel /><PuzzleSeriesPanel /><FenReviewPanel /><LichessPuzzlePublisher /><ChessLearningPanel key={"learning:"+scope} workplaceId={workplaceId} />
      <MaterialHistoryPanel key={"materials:"+scope} initialWorkplaceId={workplaceId} initialWorkplaces={workplaces} /></div>
  </div>;
}
