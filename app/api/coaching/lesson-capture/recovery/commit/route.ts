import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CoachError} from "@/lib/server/coach-service";
import {archivedLessonRecoveryCommitSchema,teacherArchivedLessonRecoveryCommit} from "@/lib/server/archived-lesson-recovery";

/** Same owner-scoped domain operation exposed through website and delegated MCP. */
export async function POST(req:NextRequest){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=archivedLessonRecoveryCommitSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
  error:"Invalid archived lesson commit",code:"VALIDATION_ERROR",
  issues:parsed.error.issues.map(i=>({path:i.path.join("."),message:i.message})),
 },{status:400});
 try{
  return NextResponse.json(await teacherArchivedLessonRecoveryCommit(db,user.id,parsed.data),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(caught){
  const known=caught instanceof CoachError;
  return NextResponse.json({
   error:known?caught.message:"Archived lesson operation unavailable",
   code:known?caught.code:"DATABASE_ERROR",
  },{status:known?caught.status:500});
 }
}
