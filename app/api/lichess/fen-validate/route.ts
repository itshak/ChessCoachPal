import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {PuzzleReviewError} from "@/lib/lichess-puzzles";
import {teacherFenValidate} from "@/lib/server/fen-validation";
const schema=z.object({fen:z.string().min(10).max(120),
 source:z.enum(["manual","image"]).default("manual")}).strict();
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=schema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid FEN review request"},{status:400});
 try{return NextResponse.json(teacherFenValidate(parsed.data.fen,parsed.data.source),{
  headers:{"Cache-Control":"no-store"},
 });}catch(e){
  return NextResponse.json({error:e instanceof PuzzleReviewError?e.message:
    "Position validation unavailable",
   code:e instanceof PuzzleReviewError?e.code:"DATABASE_ERROR",
  },{status:e instanceof PuzzleReviewError?400:500});
 }
}
