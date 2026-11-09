import { TrainingHomeworkPanel } from "@/components/teacher/TrainingHomeworkPanel";
import { LearningMaterialsCatalog } from "@/components/teacher/LearningMaterialsCatalog";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";

export const metadata = { title: "Training & materials" };

export default function LearningPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8">
    <div className="space-y-8"><LearningMaterialsCatalog /><TrainingHomeworkPanel /><ChessLearningPanel /><MaterialHistoryPanel /></div>
  </main>;
}
