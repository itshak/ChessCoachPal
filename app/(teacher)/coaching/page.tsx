import {getTranslations} from "next-intl/server";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {dailyCloseRosterInput} from "@/lib/server/daily-lesson-close";
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

export default async function CoachingPage({searchParams}:{searchParams:Promise<{recordSession?:string|string[];recordWorkplace?:string|string[];capture?:string|string[]}>}) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return null;
  const context=await teacherWorkplaceContextGet(db,user.id);
  const selected=context.selectedWorkplaceId;
  const {recordSession,recordWorkplace,capture}=await searchParams;
  const exact=recordSession!==undefined||recordWorkplace!==undefined;
  const pin=dailyCloseRosterInput.safeParse({sessionId:recordSession,dailyWorkplaceId:recordWorkplace==="all"?null:recordWorkplace});
  if(exact){
    const t=await getTranslations("lessonCompletion");
    return <main id="lesson-completion" className="max-w-6xl mx-auto px-4 py-8">
      {pin.success&&pin.data.dailyWorkplaceId!==undefined
        ? <LessonCompletionPanel key={pin.data.sessionId+":"+(pin.data.dailyWorkplaceId??"all")}
          pinned={{sessionId:pin.data.sessionId,workplaceId:pin.data.dailyWorkplaceId}}/>
        : <p role="alert">{t("exactUnavailable")}</p>}
    </main>;
  }
  if(capture==="1"){
    const nav=await getTranslations("nav");
    return <div className="ccp-focused-page space-y-6" data-capture-workspace>
      <header className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold ccp-mobile-sr-only">{nav("capture")}</h1><Link href="/coaching" className="text-primary underline min-h-11 content-center">{nav("lessons")}</Link></header>
      <LessonCapturePreviewPanel key={"capture:"+(selected??"all")} initialWorkplaceId={selected} initialWorkplaces={context.workplaces}/>
      <LessonCompletionPanel key={"completion:"+(selected??"all")} workplaceId={selected}/>
    </div>;
  }
  return <><ChessCoachWorkspace initialWorkplaceId={selected} /><div className="max-w-6xl mx-auto px-4 py-8 space-y-8"><LessonCapturePreviewPanel key={"capture:"+(selected??"all")} initialWorkplaceId={selected} initialWorkplaces={context.workplaces} /><LessonCompletionPanel key={"completion:"+(selected??"all")} workplaceId={selected} /><CoachingReportPanel initialWorkplaceId={selected} /><CompensationAgreementsPanel initialWorkplaceId={selected} /><UnifiedLessonHistoryPanel initialWorkplaceId={selected} /><ChessLearningPanel key={"learning:"+(selected??"all")} workplaceId={selected} /><MaterialHistoryPanel key={"materials:"+(selected??"all")} initialWorkplaceId={selected} initialWorkplaces={context.workplaces} /></div></>;
}
