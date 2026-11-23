import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {SpreadsheetImportError} from "@/lib/server/teacher-spreadsheet-import";
async function auth(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof SpreadsheetImportError?error.message:"Spreadsheet unavailable",
 code:error instanceof SpreadsheetImportError?error.code:"SPREADSHEET_UNAVAILABLE",
},{status:error instanceof SpreadsheetImportError?error.status:500});
import {teacherSpreadsheetParse,teacherSpreadsheetReview,spreadsheetReviewSchema} from "@/lib/server/teacher-spreadsheet-import";
export async function POST(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const form=await req.formData().catch(()=>null);
 const file=form?.get("file");
 if(!(file instanceof File))return NextResponse.json({error:"file is required"},{status:400});
 try{return NextResponse.json(teacherSpreadsheetParse(file.name,await file.arrayBuffer()));}
 catch(error){return fail(error);}
}
export async function PUT(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=spreadsheetReviewSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid spreadsheet review"},{status:400});
 try{return NextResponse.json(await teacherSpreadsheetReview(teacher.db,teacher.id,input.data));}
 catch(error){return fail(error);}
}
