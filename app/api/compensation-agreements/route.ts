import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {
 compensationAgreementCreateSchema,compensationAgreementsList,
 compensationAgreementCreate,CompensationAgreementError,
} from "@/lib/server/compensation-agreements-service";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof CompensationAgreementError?e.message:"Agreement unavailable",
 code:e instanceof CompensationAgreementError?e.code:"DATABASE_ERROR"},
 {status:e instanceof CompensationAgreementError?e.status:500,headers:noStore});
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const workplaceId=req.nextUrl.searchParams.get("workplaceId")??undefined;
 const includeArchived=req.nextUrl.searchParams.get("includeArchived")==="true";
 if(workplaceId&&!/^[0-9a-f-]{36}$/i.test(workplaceId))
  return NextResponse.json({error:"Invalid workplace"},{status:400,headers:noStore});
 try{return NextResponse.json(await compensationAgreementsList(db,user.id,{workplaceId,includeArchived}),{headers:noStore});}
 catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"FORBIDDEN"},{status:403,headers:noStore});
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=parseBody(compensationAgreementCreateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 try{return NextResponse.json(await compensationAgreementCreate(db,user.id,parsed.data),{status:201,headers:noStore});}
 catch(e){return failure(e);}
}
