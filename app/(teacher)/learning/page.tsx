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

export default async function LearningPage() {
  const t=await getTranslations("nav");
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return null;
  const {selectedWorkplaceId:workplaceId,workplaces}=await teacherWorkplaceContextGet(db,user.id);
  const scope=workplaceId??"all";
  return <div className="max-w-6xl mx-auto px-4 py-8">
    <h1 className="text-2xl font-bold mb-6">{t("learning")}</h1>
    <div className="space-y-8"><LearningMaterialsCatalog /><TrainingHomeworkPanel key={"homework:"+scope} workplaceId={workplaceId} /><LichessConnectionPanel /><LichessStudyExplorer /><StudyPreferencesPanel />
      <StudyChapterEvidencePanel /><PuzzleSeriesPanel /><FenReviewPanel /><LichessPuzzlePublisher /><ChessLearningPanel key={"learning:"+scope} workplaceId={workplaceId} />
      <MaterialHistoryPanel key={"materials:"+scope} initialWorkplaceId={workplaceId} initialWorkplaces={workplaces} /></div>
  </div>;
}
