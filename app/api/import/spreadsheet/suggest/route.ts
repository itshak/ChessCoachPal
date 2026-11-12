import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {SpreadsheetImportError} from "@/lib/server/teacher-spreadsheet-import";
async function auth(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof SpreadsheetImportError?error.message:"Spreadsheet unavailable",
 code:error instanceof SpreadsheetImportError?error.code:"DATABASE_ERROR",
},{status:error instanceof SpreadsheetImportError?error.status:500});
import {teacherSpreadsheetSuggest} from "@/lib/server/teacher-spreadsheet-import";
export async function POST(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body)||
    !Array.isArray(body.headers)||!body.headers.length)
   return NextResponse.json({error:"headers required"},{status:400});
 // Preserve the existing UI's AI suggestion behavior when no mode is sent,
 // but give website callers the SAME offline/local deterministic option as MCP.
 // No student/guardian sample is shared without explicit external consent.
 const useAi=body.useAi===undefined?true:body.useAi;
 if(typeof useAi!=="boolean")
   return NextResponse.json({error:"useAi must be a boolean",
     code:"VALIDATION_ERROR"},{status:400});
 if(useAi&&body.confirmedExternal!==true)
   return NextResponse.json({
     error:"Explicit approval is required before sharing spreadsheet samples with an external AI",
     code:"CONFIRMATION_REQUIRED",
   },{status:400});
 try{return NextResponse.json(await teacherSpreadsheetSuggest(teacher.db,teacher.id,{
  headers:body.headers,sampleRows:body.sampleRows??[],useAi,
  confirmedExternal:useAi&&body.confirmedExternal===true,
 }));}catch(error){return fail(error);}
}
