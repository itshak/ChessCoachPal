import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {puzzleDraftSchema} from "@/lib/lichess-puzzles";
import {teacherLichessPuzzlePreview,LichessPuzzleError} from "@/lib/server/lichess-puzzles";

/** Preview only: no outgoing request and no image-to-FEN claim. */
export async function POST(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=puzzleDraftSchema.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)
  return NextResponse.json({error:"Invalid puzzle review fields",code:"VALIDATION_ERROR"},{status:400});
 try{
  return NextResponse.json(teacherLichessPuzzlePreview(parsed.data),{
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({
    error:error instanceof LichessPuzzleError?error.message:"Could not preview puzzle",
    code:error instanceof LichessPuzzleError?error.code:"DATABASE_ERROR",
  },{status:error instanceof LichessPuzzleError?error.status:500,
     headers:{"Cache-Control":"no-store"}});
 }
}
