import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {SpreadsheetImportError} from "@/lib/server/teacher-spreadsheet-import";
async function auth(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof SpreadsheetImportError?error.message:"Spreadsheet unavailable",
},{status:error instanceof SpreadsheetImportError?error.status:500});
import {teacherSpreadsheetSuggest} from "@/lib/server/teacher-spreadsheet-import";
export async function POST(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!Array.isArray(body?.headers)||!body.headers.length)
   return NextResponse.json({error:"headers required"},{status:400});
 try{return NextResponse.json(await teacherSpreadsheetSuggest(teacher.db,teacher.id,{
  headers:body.headers,sampleRows:Array.isArray(body.sampleRows)?body.sampleRows:[],useAi:true,
 }));}catch(error){return fail(error);}
}
