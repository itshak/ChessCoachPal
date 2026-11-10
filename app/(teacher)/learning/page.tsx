import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { LichessConnectionPanel } from "@/components/teacher/LichessConnectionPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";

export const metadata = { title: "Chess learning" };

export default function LearningPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8">
    <div className="space-y-8"><LichessConnectionPanel /><ChessLearningPanel /><MaterialHistoryPanel /></div>
  </main>;
}
