import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CreditServiceError } from "@/lib/server/teacher-credit-service";
async function auth(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const fail=(error:unknown)=>NextResponse.json({
 error:error instanceof CreditServiceError?error.message:"Credit service unavailable",
},{status:error instanceof CreditServiceError?error.status:500});
import {parseBody,creditPackageCreateSchema} from "@/lib/server/api-schemas";
import {teacherCreditPackagesList,teacherCreditPackageCreate} from "@/lib/server/teacher-credit-service";
export async function GET(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherCreditPackagesList(teacher.db,teacher.id,
  req.nextUrl.searchParams.get("studentId")||undefined));}
 catch(error){return fail(error);}
}
export async function POST(req:NextRequest){
 const teacher=await auth();if(!teacher)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=parseBody(creditPackageCreateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 try{return NextResponse.json(await teacherCreditPackageCreate(teacher.db,teacher.id,parsed.data));}
 catch(error){return fail(error);}
}
