import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherHistoricalAttendanceReport,teacherHistoricalAttendanceSummary} from "@/lib/server/teacher-historical-attendance";
import {HistoricalImportError} from "@/lib/server/teacher-historical-stage";
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 try{
  const filters={studentId:q.get("studentId")??undefined,
    workplaceId:q.get("workplaceId")??undefined};
  return NextResponse.json(q.get("summary")==="true"
   ?await teacherHistoricalAttendanceSummary(db,user.id,filters)
   :await teacherHistoricalAttendanceReport(db,user.id,{
    ...filters,limit:Number(q.get("limit")??50),offset:Number(q.get("offset")??0),
   }));
 }
 catch(e){return NextResponse.json({
  error:e instanceof HistoricalImportError?e.message:"Historical report unavailable",
  code:e instanceof HistoricalImportError?e.code:"DATABASE_ERROR",
 },{status:e instanceof HistoricalImportError?e.status:503});}
}
