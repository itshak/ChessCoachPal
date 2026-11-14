import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 scheduleDayPreviewSchema,teacherScheduleDayPreview,LessonTimingError,
} from "@/lib/server/lesson-schedule-inference";

/** Site and delegated MCP share an exact owned-slot day preflight. */
export async function POST(request:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=scheduleDayPreviewSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
  error:"Invalid workplace, date or selected student IDs",code:"VALIDATION_ERROR",
 },{status:400});
 try {
  return NextResponse.json(await teacherScheduleDayPreview(db,user.id,parsed.data),
    {headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({
   error:error instanceof LessonTimingError?error.message:"Schedule preview unavailable",
   code:error instanceof LessonTimingError?error.code:"DATABASE_ERROR",
  },{status:503});
 }
}
