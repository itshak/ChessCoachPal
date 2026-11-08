import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {unifiedLessonFilter,teacherUnifiedLessonHistory,UnifiedHistoryError} from "@/lib/server/unified-lesson-service";
export async function GET(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const parsed=unifiedLessonFilter.safeParse({
  from:q.get("from"),to:q.get("to"),studentId:q.get("studentId")||undefined,
  workplaceId:q.get("workplaceId")||undefined,offset:Number(q.get("offset")??0),
  limit:Number(q.get("limit")??50),
 });
 if(!parsed.success)return NextResponse.json({error:"Invalid lesson history period or filter"},{status:400});
 try{return NextResponse.json(await teacherUnifiedLessonHistory(db,user.id,parsed.data),{
  headers:{"Cache-Control":"no-store"},
 });}
 catch(error){return NextResponse.json({
  error:error instanceof UnifiedHistoryError?error.message:"Lesson history unavailable",
  code:error instanceof UnifiedHistoryError?error.code:"DATABASE_ERROR",
 },{status:error instanceof UnifiedHistoryError?error.status:500});}
}
