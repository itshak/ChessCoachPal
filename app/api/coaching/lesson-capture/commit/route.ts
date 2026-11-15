import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {atomicLessonChapterCommitSchema,teacherAtomicLessonChapterCommit,
 AtomicLessonChapterError} from "@/lib/server/atomic-lesson-chapter";

/** Website ↔ delegated MCP use one authenticated transaction, not two writes. */
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=atomicLessonChapterCommitSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid combined lesson/chapter approval",code:"VALIDATION_ERROR"},{status:400});
 try{
  return NextResponse.json(await teacherAtomicLessonChapterCommit(db,user.id,parsed.data),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(e){
  return NextResponse.json({
   error:e instanceof AtomicLessonChapterError?e.message:"Lesson/chapter commit unavailable",
   code:e instanceof AtomicLessonChapterError?e.code:"DATABASE_ERROR",
  },{status:e instanceof AtomicLessonChapterError?e.status:500});
 }
}
