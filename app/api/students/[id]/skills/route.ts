import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { studentSkillAssessmentsRecord, studentSkillAssessmentsList, TeacherSkillsError } from "@/lib/server/teacher-skills-service";
type Context={params:Promise<{id:string}>};
async function auth() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,id:user.id}:null;
}
export async function GET(_req:NextRequest,{params}:Context) {
  const teacher=await auth();
  if(!teacher) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {return NextResponse.json(await studentSkillAssessmentsList(teacher.db,teacher.id,(await params).id));}
  catch(error){return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to list skills"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
export async function POST(req:NextRequest,{params}:Context) {
  const teacher=await auth();
  if(!teacher) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!Array.isArray(body?.ratings))return NextResponse.json({error:"ratings required"},{status:400});
  try {return NextResponse.json(await studentSkillAssessmentsRecord(teacher.db,teacher.id,
    (await params).id,body.ratings));}
  catch(error){return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to record skills"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
