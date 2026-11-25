import {NextRequest,NextResponse} from "next/server";
import {browserApiOrigin} from "@/lib/server/http";
import {createClient} from "@/lib/supabase/server";
import {
 PrivateLearnerReportError,getPrivateLearnerReport,listPrivateLearnerReports,reviewPrivateLearnerReport,
 savePrivateLearnerReport,privateLearnerReportGetInput,privateLearnerReportListInput,
 privateLearnerReportReviewInput,privateLearnerReportSaveInput,
} from "@/lib/server/private-learner-report";

export const dynamic="force-dynamic";
const send=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const invalid=()=>send({code:"VALIDATION_ERROR",error:"Choose valid private report details"},400);
function failed(reason:unknown){
 if(reason instanceof PrivateLearnerReportError)return send({code:reason.code,error:reason.message},reason.status);
 return send({code:"DATABASE_ERROR",error:"Private report unavailable"},503);
}
type Route={params:Promise<{id:string}>};

export async function GET(request:NextRequest,{params}:Route){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return send({code:"UNAUTHENTICATED",error:"Unauthorized"},401);
 const {id:studentId}=await params;
 const q=request.nextUrl.searchParams;
 try{
  if(q.get("mode")==="review"){
   const i=privateLearnerReportReviewInput.safeParse({
    studentId,workplaceId:q.get("workplaceId"),from:q.get("from"),to:q.get("to"),outputLocale:q.get("outputLocale"),
   });
   return i.success?send(await reviewPrivateLearnerReport(db,i.data)):invalid();
  }
  if(q.get("mode")==="get"){
   const i=privateLearnerReportGetInput.safeParse({studentId,publicationId:q.get("publicationId")});
   return i.success?send(await getPrivateLearnerReport(db,user.id,i.data)):invalid();
  }
  if(q.get("mode")==="list"){
   const i=privateLearnerReportListInput.safeParse({studentId});
   return i.success?send(await listPrivateLearnerReports(db,user.id,i.data)):invalid();
  }
  return invalid();
 }catch(reason){return failed(reason);}
}

export async function POST(request:NextRequest,{params}:Route){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return send({code:"UNAUTHENTICATED",error:"Unauthorized"},401);
 if(request.headers.get("origin")!==browserApiOrigin(request)||
   request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
  return send({code:"FORBIDDEN",error:"Origin or content rejected"},403);
 const {id:studentId}=await params;
 const input=await request.json().catch(()=>null);
 if(!input||typeof input!=="object"||Array.isArray(input))return invalid();
 const i=privateLearnerReportSaveInput.safeParse({...input,studentId});
 if(!i.success)return invalid();
 try{return send(await savePrivateLearnerReport(db,i.data));}
 catch(reason){return failed(reason);}
}
