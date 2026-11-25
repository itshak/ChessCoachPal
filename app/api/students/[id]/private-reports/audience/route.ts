import {NextRequest,NextResponse} from "next/server";
import {browserApiOrigin} from "@/lib/server/http";
import {createClient} from "@/lib/supabase/server";
import {PrivateLearnerReportError} from "@/lib/server/private-learner-report";
import {
 approveReportAudience,listReportAudience,reviewReportAudience,withdrawReportAudience,
 reportAudienceListInput,reportAudienceReviewInput,reportAudienceApproveInput,reportAudienceWithdrawInput,
} from "@/lib/server/private-learner-report-audience";

export const dynamic="force-dynamic";
const send=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const invalid=()=>send({code:"VALIDATION_ERROR",error:"Choose valid report access details"},400);
function failed(reason:unknown){
 if(reason instanceof PrivateLearnerReportError)return send({code:reason.code,error:reason.message},reason.status);
 return send({code:"DATABASE_ERROR",error:"Report access unavailable"},503);
}
type Route={params:Promise<{id:string}>};

export async function GET(request:NextRequest,{params}:Route){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return send({code:"UNAUTHENTICATED",error:"Unauthorized"},401);
 const {id:studentId}=await params;
 const q=request.nextUrl.searchParams;
 const common={studentId,publicationId:q.get("publicationId")};
 try{
  if(q.get("mode")==="review"){
   const input=reportAudienceReviewInput.safeParse({...common,portalGrantId:q.get("portalGrantId")});
   return input.success?send(await reviewReportAudience(db,user.id,input.data)):invalid();
  }
  if(q.get("mode")==="list"){
   const approvedAt=q.get("afterApprovedAt"),portalGrantId=q.get("afterPortalGrantId");
   const input=reportAudienceListInput.safeParse({...common,
    ...(approvedAt!==null||portalGrantId!==null?{approvalsAfter:{approvedAt,portalGrantId}}:{}),
   });
   return input.success?send(await listReportAudience(db,user.id,input.data)):invalid();
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
 const raw=await request.json().catch(()=>null);
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return invalid();
 const {mode,...details}=raw;
 const body={...details,studentId};
 try{
  if(mode==="approve"){
   const input=reportAudienceApproveInput.safeParse(body);
   return input.success?send(await approveReportAudience(db,user.id,input.data)):invalid();
  }
  if(mode==="withdraw"){
   const input=reportAudienceWithdrawInput.safeParse(body);
   return input.success?send(await withdrawReportAudience(db,user.id,input.data)):invalid();
  }
  return invalid();
 }catch(reason){return failed(reason);}
}
