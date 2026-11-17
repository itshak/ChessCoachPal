import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherHistoricalDatesPreview,teacherHistoricalDatesCommit}
 from "@/lib/server/teacher-historical-attendance-dates";
import {HistoricalImportError} from "@/lib/server/teacher-historical-stage";

async function run(req:NextRequest,commit:boolean){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json().catch(()=>null);
  return NextResponse.json(commit?await teacherHistoricalDatesCommit(db,user.id,body):
    await teacherHistoricalDatesPreview(db,user.id,body));
 }catch(e){
  return NextResponse.json({error:e instanceof HistoricalImportError?e.message:
   "Attendance date import unavailable",code:e instanceof HistoricalImportError?e.code:"DATABASE_ERROR"},
   {status:e instanceof HistoricalImportError?e.status:503});
 }
}
export async function POST(req:NextRequest){return run(req,false);}
export async function PUT(req:NextRequest){return run(req,true);}
