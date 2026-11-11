import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {puzzlePublishSchema} from "@/lib/lichess-puzzles";
import {teacherLichessPuzzlePublish,LichessPuzzleError} from "@/lib/server/lichess-puzzles";
import {LichessConnectionError} from "@/lib/server/lichess-connections";

/** Approved provider write; retries are mediated by durable SQL receipts. */
export async function POST(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=puzzlePublishSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)
  return NextResponse.json({
    error:"Preview digest, unique request key and explicit publishing approval required",
    code:"VALIDATION_ERROR",
  },{status:400});
 try{
  return NextResponse.json(await teacherLichessPuzzlePublish(db,user.id,parsed.data),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  const known=error instanceof LichessPuzzleError||error instanceof LichessConnectionError;
  return NextResponse.json({
    error:known?error.message:"Lichess puzzle publishing unavailable",
    code:known?error.code:"DATABASE_ERROR",
  },{status:known?error.status:500,headers:{"Cache-Control":"no-store"}});
 }
}
