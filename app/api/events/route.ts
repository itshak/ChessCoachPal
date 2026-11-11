import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeacherEventError } from "@/lib/server/teacher-events-service";
import {eventCreateSchema} from "@/lib/server/teacher-event-schemas";
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
import {teacherEventsList,teacherEventCreate,type TeacherEventInput} from "@/lib/server/teacher-events-service";
export async function GET(){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherEventsList(teacher.db,teacher.id));}
 catch(error){return failure(error);}
}
export async function POST(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=eventCreateSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:"Invalid event data",code:"VALIDATION_ERROR"},{status:400});
 try{return NextResponse.json(await teacherEventCreate(teacher.db,teacher.id,input.data as TeacherEventInput),{status:201});}
 catch(error){return failure(error);}
}
