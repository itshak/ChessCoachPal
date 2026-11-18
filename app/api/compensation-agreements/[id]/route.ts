import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {
 compensationAgreementGet,compensationAgreementUpdate,
 compensationAgreementUpdateSchema,CompensationAgreementError,
} from "@/lib/server/compensation-agreements-service";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof CompensationAgreementError?e.message:"Agreement unavailable",
 code:e instanceof CompensationAgreementError?e.code:"DATABASE_ERROR"},
 {status:e instanceof CompensationAgreementError?e.status:500,headers:noStore});
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 try{return NextResponse.json(await compensationAgreementGet(db,user.id,id),{headers:noStore});}
 catch(e){return failure(e);}
}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"FORBIDDEN"},{status:403,headers:noStore});
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=parseBody(compensationAgreementUpdateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 if(parsed.data.id!==id)return NextResponse.json({error:"Agreement ID mismatch"},{status:400,headers:noStore});
 try{return NextResponse.json(await compensationAgreementUpdate(db,user.id,parsed.data),{headers:noStore});}
 catch(e){return failure(e);}
}
