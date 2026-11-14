import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {sessionNotesList,sessionNoteSave,SessionNoteError,
  type SaveSessionNoteInput} from "@/lib/server/canonical-session-notes";

type Context={params:Promise<{id:string}>};
const failure=(error:unknown)=>NextResponse.json({
 error:error instanceof SessionNoteError?error.message:"Session notes unavailable",
 code:error instanceof SessionNoteError?error.code:"DATABASE_ERROR",
},{status:error instanceof SessionNoteError?error.status:500,
  headers:{"Cache-Control":"no-store"}});

export async function GET(req:NextRequest,{params}:Context){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 try{
  return NextResponse.json(await sessionNotesList(db,user.id,(await params).id,{
   includePrivate:q.get("includePrivate")==="true",
   confirmed:q.get("confirmed")==="true",
  }),{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}

export async function PUT(req:NextRequest,{params}:Context){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{
  const receipt=await sessionNoteSave(db,user.id,(await params).id,
    body as SaveSessionNoteInput);
  return NextResponse.json(receipt,{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
