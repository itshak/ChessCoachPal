import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {studentContactUnlinkSchema} from "@/lib/server/contact-schemas";
import {studentContactUnlink,ContactServiceError} from "@/lib/server/teacher-contacts-service";
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string;linkId:string}>}){
  const {id,linkId}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=parseBody(studentContactUnlinkSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await studentContactUnlink(db,user.id,id,linkId,parsed.data));}
  catch(e){return NextResponse.json({error:e instanceof ContactServiceError?e.message:"Unlink unavailable",
    code:e instanceof ContactServiceError?e.code:"DATABASE_ERROR"},
    {status:e instanceof ContactServiceError?e.status:500});}
}
