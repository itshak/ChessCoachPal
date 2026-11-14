import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {puzzleSeriesCreateSchema,puzzleSeriesReconcileSchema,puzzleCapacitySchema,
 teacherPuzzleSeriesList,teacherPuzzleStudyCapacity,teacherPuzzleSeriesCreate,
 teacherPuzzleSeriesReconcile,PuzzleSeriesError} from "@/lib/server/puzzle-study-series";
import {LichessConnectionError} from "@/lib/server/lichess-connections";
const failure=(e:unknown)=>NextResponse.json({
 error:e instanceof PuzzleSeriesError||e instanceof LichessConnectionError?e.message:
  "Lichess Puzzles series unavailable",
 code:e instanceof PuzzleSeriesError||e instanceof LichessConnectionError?e.code:
  "DATABASE_ERROR",
},{status:e instanceof PuzzleSeriesError||e instanceof LichessConnectionError?e.status:500});
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const p=req.nextUrl.searchParams;
 if([...p.keys()].some(k=>k!=="studyId")||p.getAll("studyId").length>1)
  return NextResponse.json({error:"Invalid puzzle study filter"},{status:400});
 try{
  if(p.has("studyId")){
   const parsed=puzzleCapacitySchema.safeParse({studyId:p.get("studyId")});
   if(!parsed.success)return NextResponse.json({error:"Invalid study ID"},{status:400});
   return NextResponse.json(await teacherPuzzleStudyCapacity(user.id,parsed.data));
  }
  return NextResponse.json(await teacherPuzzleSeriesList(db,user.id));
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const action=z.discriminatedUnion("action",[
  puzzleSeriesCreateSchema.extend({action:z.literal("create")}),
  puzzleSeriesReconcileSchema.extend({action:z.literal("reconcile")}),
 ]).safeParse(await req.json().catch(()=>null));
 if(!action.success)return NextResponse.json({error:"Explicit study consent required"},{status:400});
 try{
  const {action:kind,...rest}=action.data;
  const result=kind==="create"?
   await teacherPuzzleSeriesCreate(db,user.id,rest as Parameters<typeof teacherPuzzleSeriesCreate>[2]):
   await teacherPuzzleSeriesReconcile(db,user.id,rest as Parameters<typeof teacherPuzzleSeriesReconcile>[2]);
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}
}
