import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/server/http";
import { LegacyAttendanceError } from "@/lib/server/legacy-attendance-service";
async function teacher(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id,email:user.email}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof LegacyAttendanceError?error.message:"Attendance unavailable",
 code:error instanceof LegacyAttendanceError?error.code:"DATABASE_ERROR",
},{status:error instanceof LegacyAttendanceError?error.status:500});
import { calendarLessonNoteRead,calendarLessonNoteWrite,type NotesInput } from "@/lib/server/legacy-attendance-service";
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Context){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await calendarLessonNoteRead(auth.db,auth.id,(await params).id));}
 catch(error){return fail(error);}
}
export async function PUT(req:NextRequest,{params}:Context){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{return NextResponse.json(await calendarLessonNoteWrite(auth.db,auth.id,(await params).id,
  body as NotesInput,{origin:requestOrigin(req),teacherEmail:auth.email}));}
 catch(error){return fail(error);}
}
