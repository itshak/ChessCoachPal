import { ChessCoachWorkspace } from "@/components/teacher/ChessCoachWorkspace";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";
import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";
import { UnifiedLessonHistoryPanel } from "@/components/teacher/UnifiedLessonHistoryPanel";

export const metadata = {
  title: "Chess coaching",
  description: "Workplaces, classes, lessons and per-student attendance",
};

export default function CoachingPage() {
  return <><ChessCoachWorkspace /><div className="max-w-6xl mx-auto px-4 py-8 space-y-8"><CoachingReportPanel /><UnifiedLessonHistoryPanel /><ChessLearningPanel /><MaterialHistoryPanel /></div></>;
}
