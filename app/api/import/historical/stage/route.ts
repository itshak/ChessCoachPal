import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherHistoricalStageUpload,teacherHistoricalStageInfo,
  teacherHistoricalStageDelete,HistoricalImportError}
 from "@/lib/server/teacher-historical-stage";
const errorResponse=(error:unknown)=>NextResponse.json({
  error:error instanceof HistoricalImportError?error.message:"Private staging unavailable",
  code:error instanceof HistoricalImportError?error.code:"STAGE_UNAVAILABLE",
},{status:error instanceof HistoricalImportError?error.status:503});
async function context(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
export async function POST(req:NextRequest){
 const user=await context();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 // Content-Length is a fast preflight; the service independently enforces size.
 if(Number(req.headers.get("content-length")??0)>9*1024*1024)
  return NextResponse.json({error:"File is too large"},{status:413});
 const form=await req.formData().catch(()=>null),file=form?.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"file is required"},{status:400});
 try{return NextResponse.json(await teacherHistoricalStageUpload(
   user.db,user.teacherId,file.name,await file.arrayBuffer()));}
 catch(error){return errorResponse(error);}
}
export async function GET(req:NextRequest){
 const user=await context();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherHistoricalStageInfo(
   user.db,user.teacherId,req.nextUrl.searchParams.get("stageId")??""));}
 catch(error){return errorResponse(error);}
}
export async function DELETE(req:NextRequest){
 const user=await context();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 try{return NextResponse.json(await teacherHistoricalStageDelete(
   user.db,user.teacherId,body?.stageId??""));}
 catch(error){return errorResponse(error);}
}
