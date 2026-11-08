import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { skillDimensionsUpdate, skillDimensionsDelete, TeacherSkillsError } from "@/lib/server/teacher-skills-service";
type Context={params:Promise<{id:string}>};
async function teacher() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
export async function PUT(req:NextRequest,{params}:Context) {
  const auth=await teacher();
  if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const body=await req.json().catch(()=>null);
  try {return NextResponse.json(await skillDimensionsUpdate(auth.db,auth.teacherId,id,
    typeof body?.name==="string"?body.name:""));}
  catch(error) {return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to update skill"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
export async function DELETE(_req:NextRequest,{params}:Context) {
  const auth=await teacher();
  if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  try {
    await skillDimensionsDelete(auth.db,auth.teacherId,id);
    return NextResponse.json({ok:true});
  } catch(error) {return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to delete skill"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
