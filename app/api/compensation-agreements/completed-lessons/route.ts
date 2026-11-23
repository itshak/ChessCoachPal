import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {compensationCompletedLessons,compensationCompletedLessonsSchema,CompensationAgreementError}
 from "@/lib/server/compensation-agreements-service";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers});
 const params=[...req.nextUrl.searchParams];
 const input=compensationCompletedLessonsSchema.safeParse(Object.fromEntries(params));
 if(!input.success||new Set(params.map(([key])=>key)).size!==params.length)
  return NextResponse.json({code:"VALIDATION_ERROR"},{status:400,headers});
 try{return NextResponse.json(await compensationCompletedLessons(db,user.id,input.data),{headers});}
 catch(error){
  const known=error instanceof CompensationAgreementError;
  return NextResponse.json({code:known?error.code:"EXACT_AGREEMENT_SCOPE_UNAVAILABLE"},
   {status:known?error.status:503,headers});
 }
}
