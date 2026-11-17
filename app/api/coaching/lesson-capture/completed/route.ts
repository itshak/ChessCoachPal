import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {completedGroupCaptureSchema,teacherCompletedGroupCapture,CompletedGroupCaptureError}
 from "@/lib/server/teacher-completed-group-capture";

/** Same owner-scoped completed lesson transaction as delegated MCP. */
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=completedGroupCaptureSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)
  return NextResponse.json({error:"Invalid completed group lesson",code:"VALIDATION_ERROR"},{status:400});
 try{
  return NextResponse.json(await teacherCompletedGroupCapture(db,user.id,parsed.data),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){
  return NextResponse.json({
   error:e instanceof CompletedGroupCaptureError?e.message:"Completed lesson unavailable",
   code:e instanceof CompletedGroupCaptureError?e.code:"DATABASE_ERROR",
  },{status:e instanceof CompletedGroupCaptureError?e.status:503});
 }
}
