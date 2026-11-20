import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {federationDefaultGet,federationDefaultSet,federationDefaultUpdateSchema,
 FederationError} from "@/lib/server/student-federations-service";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const failure=(error:unknown)=>NextResponse.json({
 code:error instanceof FederationError?error.code:"FEDERATION_UNAVAILABLE",
 error:error instanceof FederationError?error.message:"Federation preference unavailable",
},{status:error instanceof FederationError?error.status:500,headers:noStore});
export async function GET(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 try{return NextResponse.json(await federationDefaultGet(db,user.id),{headers:noStore});}
 catch(e){return failure(e);}
}
export async function PUT(req:NextRequest){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"Forbidden"},{status:403,headers:noStore});
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=parseBody(federationDefaultUpdateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 try{return NextResponse.json(await federationDefaultSet(db,user.id,parsed.data),{headers:noStore});}
 catch(e){return failure(e);}
}
