import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {federationMembershipUpdate,federationMembershipUpdateSchema,
 FederationError} from "@/lib/server/student-federations-service";
const noStore={"Cache-Control":"no-store"};
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string;membershipId:string}>}){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"Forbidden"},{status:403,headers:noStore});
 const {id,membershipId}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=parseBody(federationMembershipUpdateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 if(parsed.data.studentId!==id||parsed.data.membershipId!==membershipId)
  return NextResponse.json({error:"Identity mismatch"},{status:400,headers:noStore});
 try{return NextResponse.json(await federationMembershipUpdate(db,user.id,parsed.data),{headers:noStore});}
 catch(error){return NextResponse.json({error:error instanceof FederationError?error.message:"Federation update failed",
  code:error instanceof FederationError?error.code:"FEDERATION_UNAVAILABLE"},
  {status:error instanceof FederationError?error.status:500,headers:noStore});}
}
