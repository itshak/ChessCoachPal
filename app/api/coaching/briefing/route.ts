import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {coachBriefingSchema,teacherCoachBriefing,CoachBriefingError} from "@/lib/server/coach-briefing-service";

export async function GET(request:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const query=request.nextUrl.searchParams;
  const parsed=coachBriefingSchema.safeParse({
    studentId:query.get("studentId"),limit:Number(query.get("limit")??10),
  });
  if(!parsed.success)return NextResponse.json({error:"Invalid student briefing request"},{status:400});
  try {
    const briefing=await teacherCoachBriefing(db,user.id,parsed.data);
    return NextResponse.json(briefing,{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    return NextResponse.json({
      error:error instanceof CoachBriefingError?error.message:"Student briefing unavailable",
      code:error instanceof CoachBriefingError?error.code:"DATABASE_ERROR",
    },{status:error instanceof CoachBriefingError?error.status:500});
  }
}
