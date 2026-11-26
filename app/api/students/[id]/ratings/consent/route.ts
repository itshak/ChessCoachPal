import {NextRequest,NextResponse} from "next/server";
import {browserApiOrigin} from "@/lib/server/http";
import {createClient} from "@/lib/supabase/server";
import {StudentProfileError} from "@/lib/server/student-profile-service";
import {StudentRatingError} from "@/lib/server/online-rating-transport";
import {
 onlineRatingConsentApplySchema,onlineRatingConsentReadSchema,
 teacherOnlineRatingConsentApply,teacherOnlineRatingConsentRead,
} from "@/lib/server/online-rating-consent";

export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const json=(result:unknown,status=200)=>NextResponse.json(result,{
 status,headers:{"Cache-Control":"private, no-store"},
});
const invalid=()=>json({code:"VALIDATION_ERROR",error:"Invalid automatic rating permission request"},400);
const anon=()=>json({code:"UNAUTHENTICATED",error:"Unauthorized"},401);
function failure(reason:unknown){
 if(reason instanceof StudentRatingError||reason instanceof StudentProfileError)
  return json({code:reason.code,error:reason.message},reason.status);
 return json({code:"RATING_CONSENT_UNAVAILABLE",error:"Automatic rating permission unavailable"},503);
}
export async function GET(req:NextRequest,{params}:Context){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return anon();
 const q=req.nextUrl.searchParams;
 if([...q.keys()].length!==1||q.getAll("provider").length!==1)return invalid();
 const input=onlineRatingConsentReadSchema.safeParse({studentId:(await params).id,provider:q.get("provider")});
 if(!input.success)return invalid();
 try{return json(await teacherOnlineRatingConsentRead(db,user.id,input.data));}
 catch(reason){return failure(reason);}
}
export async function POST(req:NextRequest,{params}:Context){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return anon();
 if(req.headers.get("origin")!==browserApiOrigin(req)||
  req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
  return json({code:"FORBIDDEN",error:"Origin or content rejected"},403);
 const input=onlineRatingConsentApplySchema.safeParse(await req.json().catch(()=>null));
 if(!input.success||input.data.studentId!==(await params).id)return invalid();
 try{return json(await teacherOnlineRatingConsentApply(db,user.id,input.data));}
 catch(reason){return failure(reason);}
}
