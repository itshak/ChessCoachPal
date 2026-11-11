import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { skillDimensionsList, skillDimensionsCreate, TeacherSkillsError } from "@/lib/server/teacher-skills-service";

export async function GET() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {return NextResponse.json(await skillDimensionsList(db,user.id));}
  catch(error) {return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to list skills"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
export async function POST(req:NextRequest) {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(key=>key!=="name"&&key!=="requestId"))
    return NextResponse.json({error:"name required"},{status:400});
  try {return NextResponse.json(await skillDimensionsCreate(db,user.id,typeof body?.name==="string"?body.name:"",
    body?.requestId===undefined?undefined:body.requestId));}
  catch(error) {return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:"Unable to create skill"},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });}
}
