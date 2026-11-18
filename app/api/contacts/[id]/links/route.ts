import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {contactStudentLinksList,ContactServiceError} from "@/lib/server/teacher-contacts-service";
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await contactStudentLinksList(db,user.id,id));}
  catch(e){return NextResponse.json({error:e instanceof ContactServiceError?e.message:"Contact links unavailable",
    code:e instanceof ContactServiceError?e.code:"DATABASE_ERROR"},
    {status:e instanceof ContactServiceError?e.status:500});}
}
