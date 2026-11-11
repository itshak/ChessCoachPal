import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {puzzleDraftSchema} from "@/lib/lichess-puzzles";
import {teacherLichessPuzzlePreview,LichessPuzzleError} from "@/lib/server/lichess-puzzles";
import {
 imageFenWebsiteSchema,teacherImageFenPropose,ImageFenError,
} from "@/lib/server/teacher-image-fen";

/** Two separate, teacher-scoped preview actions share this existing route:
 * reviewed-FEN preview is local; image-to-FEN AI requires explicit disclosure
 * confirmation and never publishes to Lichess or writes a student record.
 */
export async function POST(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body:unknown=await req.json().catch(()=>null);
 if(body&&typeof body==="object"&&!Array.isArray(body)&&
    "kind" in body&&(body as {kind?:unknown}).kind==="image"){
  const parsed=imageFenWebsiteSchema.safeParse(body);
  if(!parsed.success)
   return NextResponse.json({
    error:"An approved PNG/JPEG/WebP image (up to 2 MB) is required",
    code:"VALIDATION_ERROR",
   },{status:400,headers:{"Cache-Control":"no-store"}});
  try{
   return NextResponse.json(await teacherImageFenPropose(db,user.id,parsed.data),{
    headers:{"Cache-Control":"no-store"},
   });
  }catch(error){
   const known=error instanceof ImageFenError;
   return NextResponse.json({
    error:known?error.message:"Image position proposal unavailable",
    code:known?error.code:"AI_UNAVAILABLE",
   },{status:known?error.status:502,headers:{"Cache-Control":"no-store"}});
  }
 }
 const parsed=puzzleDraftSchema.safeParse(body);
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
