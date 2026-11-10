import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  skillDimensionsUpdate,skillDimensionsDeleteImpact,skillDimensionsDelete,TeacherSkillsError,
} from "@/lib/server/teacher-skills-service";

type Context={params:Promise<{id:string}>};
async function teacher() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
function failure(error:unknown,fallback:string) {
  return NextResponse.json({error:error instanceof TeacherSkillsError?error.message:fallback},{
    status:error instanceof TeacherSkillsError?error.status:500,
  });
}
export async function GET(_req:NextRequest,{params}:Context) {
  const auth=await teacher();
  if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    return NextResponse.json(await skillDimensionsDeleteImpact(auth.db,auth.teacherId,(await params).id));
  } catch(error) {return failure(error,"Unable to inspect skill");}
}
export async function PUT(req:NextRequest,{params}:Context) {
  const auth=await teacher();
  if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const body=await req.json().catch(()=>null);
  try {return NextResponse.json(await skillDimensionsUpdate(auth.db,auth.teacherId,id,
    typeof body?.name==="string"?body.name:""));}
  catch(error) {return failure(error,"Unable to update skill");}
}
export async function DELETE(req:NextRequest,{params}:Context) {
  const auth=await teacher();
  if(!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(body?.confirmed!==true||body?.expectedAssessmentCount!==0)
    return NextResponse.json({error:"Explicit deletion approval and zero-assessment preview required"},{status:400});
  try {
    return NextResponse.json(await skillDimensionsDelete(
      auth.db,auth.teacherId,(await params).id,body.expectedAssessmentCount));
  } catch(error) {return failure(error,"Unable to delete skill");}
}
