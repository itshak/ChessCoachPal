import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {sessionsUpdate,CoachError} from "@/lib/server/coach-service";

const uuid=z.string().uuid();
const schema=z.object({
 title:z.string().min(1).max(160).optional(),
 startsAt:z.string().datetime({offset:true}).optional(),
 durationMinutes:z.number().int().min(15).max(480).optional(),
 isHomeVisit:z.boolean().optional(),
 lessonNote:z.string().max(10000).optional(),
 status:z.enum(["scheduled","cancelled"]).optional(),
 expectedUpdatedAt:z.string().datetime({offset:true}),
 idempotencyKey:uuid,
}).strict().refine(x=>x.title!==undefined||x.startsAt!==undefined||
 x.durationMinutes!==undefined||x.isHomeVisit!==undefined||x.lessonNote!==undefined||x.status!==undefined,
 {message:"Supply one session change"});
type Context={params:Promise<{id:string}>};
export async function PATCH(req:NextRequest,{params}:Context){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=schema.safeParse(await req.json().catch(()=>null));
 if(!body.success)return NextResponse.json({error:"Invalid session changes or expected revision"},{status:400});
 const {expectedUpdatedAt,idempotencyKey,...changes}=body.data;
 try{
  const result=await sessionsUpdate(db,user.id,(await params).id,{
   ...changes,expectedUpdatedAt,requestId:idempotencyKey,
  });
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({
   code:error instanceof CoachError?error.code:"DATABASE_ERROR",
   error:error instanceof CoachError?error.message:"Unable to update teaching session",
  },{status:error instanceof CoachError?error.status:500});
 }
}
