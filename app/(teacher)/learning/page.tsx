import { LearningMaterialsCatalog } from "@/components/teacher/LearningMaterialsCatalog";
import { TrainingHomeworkPanel } from "@/components/teacher/TrainingHomeworkPanel";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { LichessConnectionPanel } from "@/components/teacher/LichessConnectionPanel";
import { LichessStudyExplorer } from "@/components/teacher/LichessStudyExplorer";
import { LichessPuzzlePublisher } from "@/components/teacher/LichessPuzzlePublisher";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";

export const metadata = { title: "Training & materials" };

export default function LearningPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8">
    <div className="space-y-8"><LearningMaterialsCatalog /><TrainingHomeworkPanel /><LichessConnectionPanel /><LichessStudyExplorer /><LichessPuzzlePublisher /><ChessLearningPanel /><MaterialHistoryPanel /></div>
  </main>;
}
