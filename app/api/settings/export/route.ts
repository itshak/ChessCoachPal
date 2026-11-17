import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherExport,TeacherTransferError} from "@/lib/server/teacher-transfer-service";
import {makeTeacherCsvZip} from "@/lib/server/teacher-csv-export";
export async function GET(req:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const data=await teacherExport(db,user.id);
  if(req.nextUrl.searchParams.get("format")==="csv"){
   const archive=makeTeacherCsvZip(data);
   return new NextResponse(new Uint8Array(archive).buffer,{
    headers:{"Content-Type":"application/zip",
     "Content-Disposition":'attachment; filename="chesscoachpal-all-data-'+new Date().toISOString().slice(0,10)+'.zip"',
     "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"},
   });
  }
  const filename="chesscoachpal-export-"+new Date().toISOString().slice(0,10)+".json";
  return new NextResponse(JSON.stringify(data,null,2),{
   headers:{"Content-Type":"application/json",
    "Content-Disposition":'attachment; filename="'+filename+'"',
    "Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof TeacherTransferError?error.message:"Export failed"},{
   status:error instanceof TeacherTransferError?error.status:500,
  });
 }
}
