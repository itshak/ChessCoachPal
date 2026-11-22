import {getTranslations} from "next-intl/server";
import {createClient} from "@/lib/supabase/server";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import { ChessCoachWorkspace } from "@/components/teacher/ChessCoachWorkspace";
import { ChessLearningPanel } from "@/components/teacher/ChessLearningPanel";
import { MaterialHistoryPanel } from "@/components/teacher/MaterialHistoryPanel";
import { CoachingReportPanel } from "@/components/teacher/CoachingReportPanel";
import {CompensationAgreementsPanel} from "@/components/teacher/CompensationAgreementsPanel";
import { UnifiedLessonHistoryPanel } from "@/components/teacher/UnifiedLessonHistoryPanel";
import { LessonCompletionPanel } from "@/components/teacher/LessonCompletionPanel";
import { LessonCapturePreviewPanel } from "@/components/teacher/LessonCapturePreviewPanel";

export async function generateMetadata(){
  const t=await getTranslations("coaching");
  return {title:t("heading"),description:t("metadataDescription")};
}

export default async function CoachingPage() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return null;
  const context=await teacherWorkplaceContextGet(db,user.id);
  const selected=context.selectedWorkplaceId;
  return <><ChessCoachWorkspace initialWorkplaceId={selected} /><div className="max-w-6xl mx-auto px-4 py-8 space-y-8"><LessonCapturePreviewPanel key={"capture:"+(selected??"all")} initialWorkplaceId={selected} initialWorkplaces={context.workplaces} /><LessonCompletionPanel key={"completion:"+(selected??"all")} workplaceId={selected} /><CoachingReportPanel initialWorkplaceId={selected} /><CompensationAgreementsPanel initialWorkplaceId={selected} /><UnifiedLessonHistoryPanel initialWorkplaceId={selected} /><ChessLearningPanel key={"learning:"+(selected??"all")} workplaceId={selected} /><MaterialHistoryPanel key={"materials:"+(selected??"all")} initialWorkplaceId={selected} initialWorkplaces={context.workplaces} /></div></>;
}
