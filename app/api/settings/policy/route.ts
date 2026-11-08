import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { teacherPolicyView,teacherPolicyUpdate } from "@/lib/server/teacher-policy-service";

export async function GET(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await teacherPolicyView(db,user.id));}
  catch{return NextResponse.json({error:"Policy unavailable"},{status:500});}
}
export async function PUT(req:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body))
    return NextResponse.json({error:"Invalid JSON"},{status:400});
  try{return await teacherPolicyUpdate(db,user.id,user.email,body);}
  catch{return NextResponse.json({error:"Policy update failed"},{status:500});}
}
