import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {dailyLessonPreparationInput,DailyPreparationError,teacherDailyLessonPreparation} from "@/lib/server/daily-lesson-preparation";

export async function GET(request:Request){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const ids=new URL(request.url).searchParams.getAll("sessionId");
  const parsed=dailyLessonPreparationInput.safeParse({sessionId:ids[0]});
  if(ids.length!==1||!parsed.success)
    return NextResponse.json({error:"Invalid session ID",code:"VALIDATION_ERROR"},{status:400});
  try{
    return NextResponse.json(await teacherDailyLessonPreparation(db,user.id,parsed.data.sessionId),
      {headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const known=error instanceof DailyPreparationError;
    return NextResponse.json({error:known?error.message:"Lesson preparation unavailable",
      code:known?error.code:"PREPARATION_UNAVAILABLE"},{status:known?error.status:500});
  }
}
