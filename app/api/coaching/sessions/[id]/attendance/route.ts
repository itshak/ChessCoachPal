import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {canonicalAttendanceList,canonicalAttendanceSet,
  canonicalAttendanceBulkSet,CanonicalAttendanceError,
  type CanonicalAttendanceSetInput,type CanonicalAttendanceBulkInput}
 from "@/lib/server/canonical-session-attendance";

type Context={params:Promise<{id:string}>};
const failure=(error:unknown)=>NextResponse.json({
 error:error instanceof CanonicalAttendanceError?error.message:"Attendance unavailable",
 code:error instanceof CanonicalAttendanceError?error.code:"DATABASE_ERROR",
},{status:error instanceof CanonicalAttendanceError?error.status:500,
  headers:{"Cache-Control":"no-store"}});
async function teacher(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
export async function GET(_req:NextRequest,{params}:Context){
 const auth=await teacher();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await canonicalAttendanceList(
  auth.db,auth.id,(await params).id),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return failure(error);}
}
export async function PUT(req:NextRequest,{params}:Context){
 const auth=await teacher();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Invalid attendance request"},{status:400});
 try{return NextResponse.json(await canonicalAttendanceSet(
  auth.db,auth.id,(await params).id,body as CanonicalAttendanceSetInput),
  {headers:{"Cache-Control":"no-store"}});}
 catch(error){return failure(error);}
}
export async function POST(req:NextRequest,{params}:Context){
 const auth=await teacher();
 if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Invalid attendance batch"},{status:400});
 try{return NextResponse.json(await canonicalAttendanceBulkSet(
  auth.db,auth.id,(await params).id,body as CanonicalAttendanceBulkInput),
  {headers:{"Cache-Control":"no-store"}});}
 catch(error){return failure(error);}
}
