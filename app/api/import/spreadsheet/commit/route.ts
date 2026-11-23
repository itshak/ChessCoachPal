import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {spreadsheetCommitSchema,teacherSpreadsheetCommit} from "@/lib/server/teacher-spreadsheet-import";
export async function POST(req:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=spreadsheetCommitSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid spreadsheet import confirmation"},{status:400});
 return teacherSpreadsheetCommit(db,user.id,input.data);
}
