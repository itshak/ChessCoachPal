import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { oauthOrigin } from "@/lib/server/agent-oauth-core";
import {teacherConnectionsList,teacherConnectionRevoke,ConnectionError} from "@/lib/server/teacher-connections-service";
export const dynamic="force-dynamic";
async function teacherId(){
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  return error?null:user?.id??null;
}
export async function GET(){
 const teacher=await teacherId();
 if(!teacher)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 try{return NextResponse.json(await teacherConnectionsList(teacher),{headers:{"Cache-Control":"no-store"}});}
 catch(error){return NextResponse.json({error:error instanceof ConnectionError?error.code:"UNAVAILABLE"},{
  status:error instanceof ConnectionError?error.status:503,
 });}
}
export async function DELETE(req:NextRequest){
 // Browser cookie sessions retain a strict same-origin CSRF guard.
 if(req.headers.get("origin")!==oauthOrigin())
  return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const teacher=await teacherId();
 if(!teacher)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 const body=await req.json().catch(()=>null);
 try{return NextResponse.json(await teacherConnectionRevoke(teacher,body?.id),{
  headers:{"Cache-Control":"no-store"},
 });}
 catch(error){return NextResponse.json({error:error instanceof ConnectionError?error.code:"UNAVAILABLE"},{
  status:error instanceof ConnectionError?error.status:503,
 });}
}
