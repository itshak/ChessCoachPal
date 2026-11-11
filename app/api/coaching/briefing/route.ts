import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {coachBriefingSchema,teacherCoachBriefing,CoachBriefingError} from "@/lib/server/coach-briefing";
import {UnifiedHistoryError} from "@/lib/server/unified-lesson-service";
import {MaterialHistoryError} from "@/lib/server/teacher-material-history";
import {AssignmentServiceError} from "@/lib/server/training-assignments";

export async function GET(request:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const p=request.nextUrl.searchParams;
  const input=coachBriefingSchema.safeParse({
    studentId:p.get("studentId"),from:p.get("from")||undefined,
    to:p.get("to")||undefined,limit:Number(p.get("limit")??20),
  });
  if(!input.success)return NextResponse.json({error:"Invalid briefing filter"},{status:400});
  try{
    const result=await teacherCoachBriefing(db,user.id,input.data);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const known=error instanceof CoachBriefingError||
      error instanceof UnifiedHistoryError||error instanceof MaterialHistoryError||
      error instanceof AssignmentServiceError;
    return NextResponse.json({
      error:known?error.message:"Coach briefing unavailable",
      code:known?error.code:"DATABASE_ERROR",
    },{status:known?error.status:500});
  }
}
