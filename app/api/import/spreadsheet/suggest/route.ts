import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {SpreadsheetImportError} from "@/lib/server/teacher-spreadsheet-import";
import {spreadsheetSuggestInputSchema} from "@/lib/spreadsheet-suggest";
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
 const parsed=spreadsheetSuggestInputSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
   error:"Invalid or oversized spreadsheet suggestion sample",
   code:"VALIDATION_ERROR",
 },{status:400});
 if(parsed.data.useAi&&parsed.data.confirmedExternal!==true)
   return NextResponse.json({
     error:"Explicit approval is required before sharing spreadsheet samples with external AI",
     code:"CONFIRMATION_REQUIRED",
   },{status:400});
 try{return NextResponse.json(await teacherSpreadsheetSuggest(teacher.db,teacher.id,{
  ...parsed.data,
 }));}catch(error){return fail(error);}
}
