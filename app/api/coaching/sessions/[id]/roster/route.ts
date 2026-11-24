import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {dailyCloseRosterInput,DailyCloseError,teacherDailyClosePreview} from "@/lib/server/daily-lesson-close";
import {createClient} from "@/lib/supabase/server";
import {
 teacherSessionRosterPreview,teacherSessionRosterCorrect,teacherSessionRosterAudit,
 SessionRosterCorrectionError,
} from "@/lib/server/session-roster-corrections";

const input=z.object({
 studentIds:z.array(z.string().uuid()).min(1).max(100),
 expectedUpdatedAt:z.string().datetime({offset:true}),
 idempotencyKey:z.string().uuid(),
 reason:z.string().trim().min(8).max(1000),
 confirmed:z.literal(true),
}).strict();

const problem=(e:unknown)=>NextResponse.json({
 error:(e instanceof SessionRosterCorrectionError||e instanceof DailyCloseError)?e.message:"Unable to correct roster",
 code:(e instanceof SessionRosterCorrectionError||e instanceof DailyCloseError)?e.code:"DATABASE_ERROR",
},{status:(e instanceof SessionRosterCorrectionError||e instanceof DailyCloseError)?e.status:500,
 headers:{"Cache-Control":"private, no-store"}});

async function teacher(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}

/** Owned, frozen roster preview, or full append-only correction history. */
export async function GET(request:NextRequest,{
 params,
}:{params:Promise<{id:string}>}){
 const actor=await teacher();
 if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
 const id=(await params).id;
 const {searchParams}=new URL(request.url);
 const revisions=searchParams.get("revisions")==="true";
 const includePrivate=searchParams.get("includePrivate")==="true";
 if(includePrivate&&searchParams.get("confirmed")!=="true")
   return NextResponse.json({error:"Private historical notes require confirmation"},{status:400});
 try{
   const daily=searchParams.getAll("dailyWorkplaceId");
   if(daily.length){
     const parsed=dailyCloseRosterInput.safeParse({sessionId:id,dailyWorkplaceId:daily[0]==="all"?null:daily[0]});
     if(daily.length!==1||!parsed.success||revisions)
       return NextResponse.json({error:"Invalid exact lesson review",code:"VALIDATION_ERROR"},{status:400});
     return NextResponse.json(await teacherDailyClosePreview(actor.db,actor.id,id,parsed.data.dailyWorkplaceId??null),
       {headers:{"Cache-Control":"private, no-store"}});
   }
   const result=revisions
     ?await teacherSessionRosterAudit(actor.db,actor.id,id,includePrivate)
     :await teacherSessionRosterPreview(actor.db,actor.id,id);
   return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return problem(e);}
}

/** One revision-checked transaction with explicit teacher confirmation. */
export async function POST(request:NextRequest,{
 params,
}:{params:Promise<{id:string}>}){
 const actor=await teacher();
 if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid confirmed roster correction"},{status:400});
 try{
   const {studentIds,expectedUpdatedAt,idempotencyKey,reason}=parsed.data;
   return NextResponse.json(await teacherSessionRosterCorrect(actor.db,actor.id,
     (await params).id,{studentIds,expectedUpdatedAt,idempotencyKey,reason}),{
     headers:{"Cache-Control":"private, no-store"},
   });
 }catch(e){return problem(e);}
}
