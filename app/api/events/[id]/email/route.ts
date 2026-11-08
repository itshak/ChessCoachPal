import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeacherEventError } from "@/lib/server/teacher-events-service";
async function auth(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,id:user.id,email:user.email}:null;
}
function failure(error:unknown){
  return NextResponse.json({
    error:error instanceof TeacherEventError?error.message:"Event unavailable",
    code:error instanceof TeacherEventError?error.code:"DATABASE_ERROR",
  },{status:error instanceof TeacherEventError?error.status:500});
}
import { requestOrigin } from "@/lib/server/http";
import {teacherEventInviteEmail} from "@/lib/server/teacher-events-service";
type Context={params:Promise<{id:string}>};
export async function POST(req:NextRequest,{params}:Context){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherEventInviteEmail(
   teacher.db,teacher.id,(await params).id,teacher.email,requestOrigin(req)));
 }catch(error){return failure(error);}
}
