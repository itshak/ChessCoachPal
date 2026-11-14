import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {studyIndexSearchSchema,studyIndexGetSchema,studyIndexSyncSchema,
 teacherStudyIndexSearch,teacherStudyIndexGet,teacherStudyIndexSync,
 StudyIndexError} from "@/lib/server/teacher-study-index";
import {LichessConnectionError} from "@/lib/server/lichess-connections";
const failure=(e:unknown)=>NextResponse.json({
 error:e instanceof StudyIndexError||e instanceof LichessConnectionError?e.message:
  "Study chapter metadata unavailable",
 code:e instanceof StudyIndexError||e instanceof LichessConnectionError?e.code:
  "DATABASE_ERROR",
},{status:e instanceof StudyIndexError||e instanceof LichessConnectionError?e.status:500});
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const p=req.nextUrl.searchParams;
 if([...p.keys()].some(x=>!["studyId","chapterId","chapterNumber","query","limit"].includes(x))||
  [...p.keys()].some(x=>p.getAll(x).length!==1))
  return NextResponse.json({error:"Invalid study chapter filter"},{status:400});
 const common={...(p.has("studyId")?{studyId:p.get("studyId")}:{}),
  ...(p.has("chapterNumber")?{chapterNumber:Number(p.get("chapterNumber"))}:{}),
  ...(p.has("query")?{query:p.get("query")}:{}),
  ...(p.has("limit")?{limit:Number(p.get("limit"))}:{}),
 };
 const parsed=p.has("chapterId")?
  studyIndexGetSchema.safeParse({studyId:p.get("studyId"),chapterId:p.get("chapterId")}):
  studyIndexSearchSchema.safeParse(common);
 if(!parsed.success)return NextResponse.json({error:"Invalid chapter query"},{status:400});
 try{
  const data=p.has("chapterId")?await teacherStudyIndexGet(db,user.id,
    parsed.data as z.infer<typeof studyIndexGetSchema>):
   await teacherStudyIndexSearch(db,user.id,parsed.data as z.infer<typeof studyIndexSearchSchema>);
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=studyIndexSyncSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Approve exact Lichess study refresh"},{status:400});
 try{return NextResponse.json(await teacherStudyIndexSync(db,user.id,parsed.data));}
 catch(e){return failure(e);}
}
