import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";

export const metadata = { title: "Chess learning" };

export default function LearningPage() {
  return <main className="max-w-6xl mx-auto px-4 py-8">
    <ChessLearningPanel />
  </main>;
}
