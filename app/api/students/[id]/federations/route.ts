import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {federationStudentSummary,federationMembershipCreate,
 federationMembershipCreateSchema,federationSummaryInput,FederationError} from "@/lib/server/student-federations-service";
const noStore={"Cache-Control":"no-store"};
const failure=(error:unknown)=>NextResponse.json({
 code:error instanceof FederationError?error.code:"FEDERATION_UNAVAILABLE",
 error:error instanceof FederationError?error.message:"Federation records unavailable",
},{status:error instanceof FederationError?error.status:500,headers:noStore});
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const dates=req.nextUrl.searchParams.getAll("fideOn");
 const input=federationSummaryInput.safeParse({studentId:id,fideOn:dates[0]});
 if(dates.length>1||!input.success)return failure(new FederationError(400,"VALIDATION_ERROR","Invalid federation summary filters"));
 try{return NextResponse.json(await federationStudentSummary(db,user.id,id,input.data.fideOn),{headers:noStore});}
 catch(e){return failure(e);}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"Forbidden"},{status:403,headers:noStore});
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers:noStore});
 const parsed=parseBody(federationMembershipCreateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 if(parsed.data.studentId!==id)return NextResponse.json({error:"Student ID mismatch"},{status:400,headers:noStore});
 try{return NextResponse.json(await federationMembershipCreate(db,user.id,parsed.data),{status:201,headers:noStore});}
 catch(e){return failure(e);}
}
