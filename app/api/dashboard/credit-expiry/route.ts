import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {WorkplaceContextError} from "@/lib/server/teacher-workplace-context";
import {professionalCreditExpiryInput,teacherProfessionalCreditExpiry} from "@/lib/server/professional-credit-expiry";

export async function GET(request:Request){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 const json=(payload:unknown,status=200)=>NextResponse.json(payload,{status,headers:{"cache-control":"private, no-store"}});
 if(!user)return json({error:"Unauthorized"},401);
 const params=new URL(request.url).searchParams;
 const input=professionalCreditExpiryInput.safeParse(Object.fromEntries(params.entries()));
 if(params.getAll("workplaceId").length!==1||!input.success)
  return json({error:"Choose one exact workplace",code:"VALIDATION_ERROR"},400);
 try{return json(await teacherProfessionalCreditExpiry(db,user.id,input.data))}
 catch(error){
  if(error instanceof WorkplaceContextError)return json({code:error.code,error:error.message},error.status);
  return json({code:"DATABASE_ERROR",error:"Credit review unavailable"},503);
 }
}
