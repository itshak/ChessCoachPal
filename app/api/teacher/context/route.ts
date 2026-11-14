import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherContextGet} from "@/lib/server/teacher-context";
export async function GET(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await teacherContextGet(db,user.id),{
  headers:{"Cache-Control":"no-store"},
 });}catch{return NextResponse.json({error:"Teacher context unavailable"},{status:503});}
}
