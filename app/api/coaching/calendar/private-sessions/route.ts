import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {canonicalPrivateSessionCreate,CanonicalPrivateSessionError}
 from "@/lib/server/canonical-private-session-service";

export async function POST(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))
  return NextResponse.json({error:"Invalid private session request"},{status:400});
 try{return NextResponse.json(await canonicalPrivateSessionCreate(db,user.id,body),
   {headers:{"Cache-Control":"no-store"}});}
 catch(e){return NextResponse.json({
   error:e instanceof CanonicalPrivateSessionError?e.message:"Cannot schedule private session",
   code:e instanceof CanonicalPrivateSessionError?e.code:"DATABASE_ERROR",
  },{status:e instanceof CanonicalPrivateSessionError?e.status:500});}
}
