import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 studentNamesResolveSchema,teacherStudentNamesResolve,LessonCapturePreviewError,
} from "@/lib/server/lesson-capture-preview";

/** Exact-name/alias preflight shared with the agent; never returns private PII. */
export async function POST(request:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=studentNamesResolveSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
  error:"Invalid exact-name resolution request",code:"VALIDATION_ERROR",
 },{status:400});
 try {
  const result=await teacherStudentNamesResolve(db,user.id,parsed.data.names,{outputLocale:parsed.data.outputLocale});
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({
   error:error instanceof LessonCapturePreviewError?error.message:"Student identity lookup unavailable",
   code:error instanceof LessonCapturePreviewError?error.code:"DATABASE_ERROR",
  },{status:error instanceof LessonCapturePreviewError?error.status:503});
 }
}
