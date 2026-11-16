import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherHistoricalAttendancePreview} from "@/lib/server/teacher-historical-attendance";
import {HistoricalImportError} from "@/lib/server/teacher-historical-stage";
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherHistoricalAttendancePreview(
  db,user.id,await req.json().catch(()=>null)));}
 catch(e){return NextResponse.json({
  error:e instanceof HistoricalImportError?e.message:"Historical preview unavailable",
  code:e instanceof HistoricalImportError?e.code:"DATABASE_ERROR",
 },{status:e instanceof HistoricalImportError?e.status:503});}
}
