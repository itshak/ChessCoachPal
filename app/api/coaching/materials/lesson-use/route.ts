import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {materialInLessonPreviewSchema,materialInLessonCommitSchema,
 teacherMaterialInLessonPreview,teacherMaterialInLessonCommit,MaterialInLessonError}
 from "@/lib/server/teacher-material-in-lesson";

/** Website and MCP share the precise preview/transaction for lesson material. */
async function run(req:NextRequest,commit:boolean){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const schema=commit?materialInLessonCommitSchema:materialInLessonPreviewSchema;
 const parsed=schema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({
  error:"Invalid material-in-lesson input",code:"VALIDATION_ERROR",
 },{status:400});
 try {
  const result=commit?
   await teacherMaterialInLessonCommit(db,user.id,
    materialInLessonCommitSchema.parse(parsed.data)):
   await teacherMaterialInLessonPreview(db,user.id,
    materialInLessonPreviewSchema.parse(parsed.data));
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  return NextResponse.json({
   error:e instanceof MaterialInLessonError?e.message:"Lesson materials unavailable",
   code:e instanceof MaterialInLessonError?e.code:"DATABASE_ERROR",
  },{status:e instanceof MaterialInLessonError?e.status:503});
 }
}
export async function POST(req:NextRequest){return run(req,false);}
export async function PUT(req:NextRequest){return run(req,true);}
