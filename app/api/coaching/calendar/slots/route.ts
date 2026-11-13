import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {canonicalSlotsList,CanonicalSlotError} from "@/lib/server/canonical-slot-service";

export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=req.nextUrl.searchParams;
 const studentId=q.get("studentId")??undefined;
 const active=q.get("activeOnly");
 if(active!==null&&active!=="true"&&active!=="false")
  return NextResponse.json({error:"Invalid activeOnly filter"},{status:400});
 try{
  const slots=await canonicalSlotsList(db,user.id,{studentId,activeOnly:active==="true"});
  return NextResponse.json(slots,{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  return NextResponse.json({
   error:e instanceof CanonicalSlotError?e.message:"Slots unavailable",
   code:e instanceof CanonicalSlotError?e.code:"DATABASE_ERROR",
  },{status:e instanceof CanonicalSlotError?e.status:500});
 }
}
