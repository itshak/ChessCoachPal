import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {CompensationAgreementError} from "@/lib/server/compensation-agreements-service";
import {privateSeriesRead,privateSeriesReadSchema,privateSeriesWrite,privateSeriesWriteSchema}
 from "@/lib/server/private-series-compensation";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const fail=(code:string,status:number)=>NextResponse.json({code},{status,headers});
const map=(error:unknown)=>error instanceof CompensationAgreementError?
 fail(error.code,error.status):fail("PRIVATE_SERIES_REVIEW_UNAVAILABLE",503);
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return fail("UNAUTHENTICATED",401);
 const args=[...req.nextUrl.searchParams],parsed=privateSeriesReadSchema.safeParse(Object.fromEntries(args));
 if(!parsed.success||new Set(args.map(([k])=>k)).size!==args.length)return fail("VALIDATION_ERROR",400);
 try{return NextResponse.json(await privateSeriesRead(db,user.id,parsed.data),{headers});}
 catch(error){return map(error);}
}
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==browserApiOrigin(req))return fail("FORBIDDEN",403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return fail("UNAUTHENTICATED",401);
 const parsed=privateSeriesWriteSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return fail("VALIDATION_ERROR",400);
 try{return NextResponse.json(await privateSeriesWrite(db,parsed.data),{headers});}
 catch(error){return map(error);}
}
