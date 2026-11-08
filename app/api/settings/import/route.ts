import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherImportApply,TeacherTransferError} from "@/lib/server/teacher-transfer-service";
export async function POST(req:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const payload=await req.json().catch(()=>null);
 try{return NextResponse.json(await teacherImportApply(db,user.id,payload));}
 catch(error){
  return NextResponse.json({error:error instanceof TeacherTransferError?error.message:"Import failed"},{
   status:error instanceof TeacherTransferError?error.status:500,
  });
 }
}
