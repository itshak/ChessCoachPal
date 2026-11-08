import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 materialCoverageFilter,teacherMaterialCoverageReport,MaterialCoverageError,
} from "@/lib/server/teacher-material-coverage";
export async function GET(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const parsed=materialCoverageFilter.safeParse({
  workplaceId:q.get("workplaceId")||undefined,studentId:q.get("studentId")||undefined,
  from:q.get("from"),to:q.get("to"),
 });
 if(!parsed.success)return NextResponse.json({error:"Invalid coverage report filters"},{status:400});
 try{return NextResponse.json(await teacherMaterialCoverageReport(db,user.id,parsed.data),{
  headers:{"Cache-Control":"no-store"},
 });}catch(e){
  return NextResponse.json({error:e instanceof MaterialCoverageError?e.message:"Coverage report unavailable",
   code:e instanceof MaterialCoverageError?e.code:"DATABASE_ERROR"},
   {status:e instanceof MaterialCoverageError?e.status:500});
 }
}
