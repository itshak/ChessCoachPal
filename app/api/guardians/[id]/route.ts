import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, guardianUpdateSchema } from "@/lib/server/api-schemas";
import { guardianDetail, guardianUpdate, guardianDelete, GuardianServiceError } from "@/lib/server/teacher-guardian-service";
type Context={params:Promise<{id:string}>};
async function auth(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
function fail(error:unknown) {
  return NextResponse.json({error:error instanceof GuardianServiceError?error.message:"Family unavailable"},{
    status:error instanceof GuardianServiceError?error.status:500,
  });
}
export async function GET(_req:NextRequest,{params}:Context){
  const teacher=await auth();
  if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await guardianDetail(teacher.db,teacher.teacherId,(await params).id));}
  catch(error){return fail(error);}
}
export async function PUT(req:NextRequest,{params}:Context){
  const teacher=await auth();
  if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=parseBody(guardianUpdateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await guardianUpdate(teacher.db,teacher.teacherId,(await params).id,parsed.data));}
  catch(error){return fail(error);}
}
export async function DELETE(_req:NextRequest,{params}:Context){
  const teacher=await auth();
  if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await guardianDelete(teacher.db,teacher.teacherId,(await params).id));}
  catch(error){return fail(error);}
}
