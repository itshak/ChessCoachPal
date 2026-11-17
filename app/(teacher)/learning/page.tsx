import {getTranslations} from "next-intl/server";
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

export default function LearningPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8">
    <div className="space-y-8"><LearningMaterialsCatalog /><TrainingHomeworkPanel /><LichessConnectionPanel /><LichessStudyExplorer /><StudyPreferencesPanel />
      <StudyChapterEvidencePanel /><PuzzleSeriesPanel /><FenReviewPanel /><LichessPuzzlePublisher /><ChessLearningPanel /><MaterialHistoryPanel /></div>
  </main>;
}
