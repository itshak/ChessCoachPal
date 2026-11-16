import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherBulkLifecyclePreview,teacherBulkLifecycleCommit,BulkLifecycleError}
  from "@/lib/server/teacher-bulk-lifecycle";
async function context(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
const errorResponse=(error:unknown)=>NextResponse.json({
 error:error instanceof BulkLifecycleError?error.message:"Lifecycle operation unavailable",
 code:error instanceof BulkLifecycleError?error.code:"DATABASE_ERROR",
},{status:error instanceof BulkLifecycleError?error.status:500});
export async function POST(req:NextRequest){
 const ctx=await context();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json().catch(()=>null);
  return NextResponse.json(await teacherBulkLifecyclePreview(ctx.db,ctx.teacherId,body?.rows));
 }catch(error){return errorResponse(error);}
}
export async function PUT(req:NextRequest){
 const ctx=await context();
 if(!ctx)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const body=await req.json().catch(()=>null);
  return NextResponse.json(await teacherBulkLifecycleCommit(ctx.db,ctx.teacherId,body));
 }catch(error){return errorResponse(error);}
}
