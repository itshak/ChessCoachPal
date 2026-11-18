import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {compensationPreviewSchema,compensationAgreementPreview,
 CompensationAgreementError} from "@/lib/server/compensation-agreements-service";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=compensationPreviewSchema.safeParse({agreementId:id,
  from:req.nextUrl.searchParams.get("from"),to:req.nextUrl.searchParams.get("to")});
 if(!parsed.success)return NextResponse.json({error:"Invalid preview range"},{status:400,headers:noStore});
 try{return NextResponse.json(await compensationAgreementPreview(db,user.id,parsed.data),{headers:noStore});}
 catch(e){return NextResponse.json({error:e instanceof CompensationAgreementError?e.message:"Unable to preview compensation",
  code:e instanceof CompensationAgreementError?e.code:"DATABASE_ERROR"},
  {status:e instanceof CompensationAgreementError?e.status:500,headers:noStore});}
}
