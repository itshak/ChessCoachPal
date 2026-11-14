import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TeacherEventError } from "@/lib/server/teacher-events-service";
import {eventUpdateSchema} from "@/lib/server/teacher-event-schemas";
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
import {
 teacherEventDetail,teacherEventUpdate,teacherEventDelete,type TeacherEventInput,
} from "@/lib/server/teacher-events-service";
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Context){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherEventDetail(teacher.db,teacher.id,(await params).id));}
 catch(error){return failure(error);}
}
export async function PUT(req:NextRequest,{params}:Context){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const input=eventUpdateSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:"Invalid event data",code:"VALIDATION_ERROR"},{status:400});
 try{return NextResponse.json(await teacherEventUpdate(teacher.db,teacher.id,(await params).id,input.data as TeacherEventInput));}
 catch(error){return failure(error);}
}
export async function DELETE(_req:NextRequest,{params}:Context){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherEventDelete(teacher.db,teacher.id,(await params).id));}
 catch(error){return failure(error);}
}
