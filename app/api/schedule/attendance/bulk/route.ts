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
import { calendarAttendanceBulk,type BulkAttendanceInput } from "@/lib/server/legacy-attendance-service";
export async function POST(req:NextRequest){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{return NextResponse.json(await calendarAttendanceBulk(auth.db,auth.id,
  body as BulkAttendanceInput,{origin:requestOrigin(req),teacherEmail:auth.email}));}
 catch(error){return fail(error);}
}
