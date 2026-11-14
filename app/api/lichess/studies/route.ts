import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherLichessStudiesSearch} from "@/lib/server/lichess-studies";
import {LichessConnectionError} from "@/lib/server/lichess-connections";

/** The user's Lichess study token never reaches the browser or MCP. */
export async function GET(request:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const p=request.nextUrl.searchParams;
  const allowed=new Set(["studyId","query","chapterNumber","limit"]);
  if([...p.keys()].some(key=>!allowed.has(key)) ||
     [...allowed].some(key=>p.getAll(key).length>1))
    return NextResponse.json({error:"Invalid Lichess study search"},{status:400});
  const chapter=p.get("chapterNumber"),limit=p.get("limit");
  if((chapter!==null&&!/^[1-9]\d*$/.test(chapter))||
     (limit!==null&&!/^[1-9]\d*$/.test(limit)))
    return NextResponse.json({error:"Invalid positive numeric search parameter"},{status:400});
  try{
    const data=await teacherLichessStudiesSearch(user.id,{
      ...(p.has("studyId")?{studyId:p.get("studyId")!}:{}),
      ...(p.has("query")?{query:p.get("query")!}:{}),
      ...(chapter!==null?{chapterNumber:Number(chapter)}:{}),
      ...(limit!==null?{limit:Number(limit)}:{}),
    });
    return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({
      error:error instanceof LichessConnectionError?error.message:"Study search unavailable",
      code:error instanceof LichessConnectionError?error.code:"DATABASE_ERROR",
    },{status:error instanceof LichessConnectionError?error.status:500,
      headers:{"Cache-Control":"no-store"}});
  }
}
