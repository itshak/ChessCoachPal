import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { studentSkillAssessmentsRecord, studentSkillAssessmentsList, TeacherSkillsError } from "@/lib/server/teacher-skills-service";
type Context={params:Promise<{id:string}>};
async function auth() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,id:user.id}:null;
}
export async function GET(req:NextRequest,{params}:Context) {
  const teacher=await auth();
  if(!teacher) return NextResponse.json({error:"Unauthorized"},{status:401});
  const q=req.nextUrl.searchParams;
  const limit=q.has("limit")?Number(q.get("limit")):1000;
  const offset=q.has("offset")?Number(q.get("offset")):0;
  try {return NextResponse.json(await studentSkillAssessmentsList(
    teacher.db,teacher.id,(await params).id,{limit,offset}));}
  catch(error){return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to list skills"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
export async function POST(req:NextRequest,{params}:Context) {
  const teacher=await auth();
  if(!teacher) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(key=>key!=="ratings"&&key!=="idempotencyKey")||
     !Array.isArray(body.ratings))
    return NextResponse.json({error:"ratings and optional idempotencyKey required"},{status:400});
  try {return NextResponse.json(await studentSkillAssessmentsRecord(teacher.db,teacher.id,
    (await params).id,body.ratings,body.idempotencyKey));}
  catch(error){return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to record skills"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
