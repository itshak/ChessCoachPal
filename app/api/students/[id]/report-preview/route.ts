import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {LearnerReportPreviewError,learnerReportPreviewInput,teacherLearnerReportPreview} from "@/lib/server/learner-report-preview";

export const dynamic="force-dynamic";
const send=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)return send({code:"UNAUTHENTICATED",error:"Unauthorized"},401);
  const q=request.nextUrl.searchParams;
  const input=learnerReportPreviewInput.safeParse({
    studentId:id,workplaceId:q.get("workplaceId"),from:q.get("from"),to:q.get("to"),outputLocale:q.get("outputLocale"),
  });
  if(!input.success)return send({code:"VALIDATION_ERROR",error:"Choose a workplace, dates and output language"},400);
  try{return send(await teacherLearnerReportPreview(db,user.id,input.data));}
  catch(reason){
    if(reason instanceof LearnerReportPreviewError)return send({code:reason.code,error:reason.message},reason.status);
    return send({code:"DATABASE_ERROR",error:"Learner report preview unavailable"},503);
  }
}
