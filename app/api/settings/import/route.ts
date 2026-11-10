import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
 teacherImportApply,teacherImportPreview,TeacherTransferError,
} from "@/lib/server/teacher-transfer-service";

function failure(error:unknown){
 return NextResponse.json({
   error:error instanceof TeacherTransferError?error.message:"Import failed",
 },{
   status:error instanceof TeacherTransferError?error.status:500,
   headers:{"Cache-Control":"no-store"},
 });
}
function input(value:unknown):Record<string,unknown>|null {
 return value&&typeof value==="object"&&!Array.isArray(value)
   ?value as Record<string,unknown>:null;
}
/** The signed-in website and MCP use the same non-mutating SHA-256 preview. */
export async function PUT(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=input(await req.json().catch(()=>null));
 if(!body||!("payload" in body))
  return NextResponse.json({error:"A backup payload is required"},{status:400});
 try{
   const {payload:_,...preview}=teacherImportPreview(body.payload);
   return NextResponse.json(preview,{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
/** Refuse unreviewed direct writes, including old raw-backup POSTs. */
export async function POST(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=input(await req.json().catch(()=>null));
 if(!body||body.confirmed!==true||
    typeof body.expectedSha256!=="string"||
    !/^[a-f0-9]{64}$/.test(body.expectedSha256)||
    !("payload" in body))
   return NextResponse.json({
     error:"Review the import preview and confirm the exact SHA-256 before applying.",
   },{status:400,headers:{"Cache-Control":"no-store"}});
 try{
   return NextResponse.json(
     await teacherImportApply(db,user.id,body.payload,body.expectedSha256),
     {headers:{"Cache-Control":"no-store"}},
   );
 }catch(error){return failure(error);}
}
