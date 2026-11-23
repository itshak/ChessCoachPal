import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {CompensationAgreementError} from "@/lib/server/compensation-agreements-service";
import {exactSponsorReviewSchema,exactSponsorReview,exactSponsorCommitSchema,exactSponsorCommit}
 from "@/lib/server/exact-sponsor-service";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
function errorResponse(code:string,status:number){return NextResponse.json({code},{status,headers});}
function map(error:unknown){
 return error instanceof CompensationAgreementError?errorResponse(error.code,error.status):
  errorResponse("EXACT_SPONSOR_OUTCOME_UNAVAILABLE",503);
}
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return errorResponse("UNAUTHENTICATED",401);
 const params=[...req.nextUrl.searchParams];
 const parsed=exactSponsorReviewSchema.safeParse(Object.fromEntries(params));
 if(!parsed.success||new Set(params.map(([key])=>key)).size!==params.length)
  return errorResponse("VALIDATION_ERROR",400);
 try{return NextResponse.json(await exactSponsorReview(db,user.id,parsed.data),{headers});}
 catch(error){return map(error);}
}
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==browserApiOrigin(req))return errorResponse("FORBIDDEN",403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return errorResponse("UNAUTHENTICATED",401);
 const parsed=exactSponsorCommitSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return errorResponse("VALIDATION_ERROR",400);
 try{return NextResponse.json(await exactSponsorCommit(db,parsed.data),{headers});}
 catch(error){return map(error);}
}
