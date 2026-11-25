import {NextRequest,NextResponse} from "next/server";
import {browserApiOrigin} from "@/lib/server/http";
import {createClient} from "@/lib/supabase/server";
import {PrivateLearnerReportError} from "@/lib/server/private-learner-report";
import {
 commitReportLifecycle,listReportLifecycleChoices,reviewReportLifecycle,
 reportLifecycleChoicesInput,reportLifecycleCommitInput,reportLifecycleReviewInput,
} from "@/lib/server/private-learner-report-lifecycle";

export const dynamic="force-dynamic";
const send=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const invalid=()=>send({code:"VALIDATION_ERROR",error:"Choose a valid saved report decision"},400);
function failed(reason:unknown){
 if(reason instanceof PrivateLearnerReportError)return send({code:reason.code,error:reason.message},reason.status);
 return send({code:"DATABASE_ERROR",error:"Saved report decision unavailable"},503);
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
  if(q.get("mode")==="choices"){
   const input=reportLifecycleChoicesInput.safeParse(common);
   return input.success?send(await listReportLifecycleChoices(db,user.id,input.data)):invalid();
  }
  if(q.get("mode")==="review"){
   const input=reportLifecycleReviewInput.safeParse({...common,replacementId:q.get("replacementId")});
   return input.success?send(await reviewReportLifecycle(db,user.id,input.data)):invalid();
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
 const input=reportLifecycleCommitInput.safeParse({...raw,studentId});
 if(!input.success)return invalid();
 try{return send(await commitReportLifecycle(db,user.id,input.data));}
 catch(reason){return failed(reason);}
}
