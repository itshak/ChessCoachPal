import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {lessonChapterPreviewSchema,lessonChapterCommitSchema,
 teacherLessonChapterPreview,teacherLessonChapterCommit,
 ChapterEvidenceError} from "@/lib/server/lesson-chapter-evidence";
import {StudyIndexError} from "@/lib/server/teacher-study-index";
const actions=z.discriminatedUnion("action",[
 lessonChapterPreviewSchema.extend({action:z.literal("preview")}),
 lessonChapterCommitSchema.extend({action:z.literal("commit")}),
]);
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=actions.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid chapter evidence request"},{status:400});
 try{
  const {action,...rest}=parsed.data;
  const result=action==="preview"?
   await teacherLessonChapterPreview(db,user.id,
    rest as Parameters<typeof teacherLessonChapterPreview>[2]):
   await teacherLessonChapterCommit(db,user.id,
    rest as Parameters<typeof teacherLessonChapterCommit>[2]);
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  const known=e instanceof ChapterEvidenceError||e instanceof StudyIndexError;
  return NextResponse.json({error:known?e.message:"Chapter evidence unavailable",
   code:known?e.code:"DATABASE_ERROR",
  },{status:known?e.status:500});
 }
}
