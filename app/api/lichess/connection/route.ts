import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
  lichessConnectionStatus,disconnectLichess,LichessConnectionError,
} from "@/lib/server/lichess-connections";

async function teacher(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?.id;
}
function fail(error:unknown){
  return NextResponse.json({
    error:error instanceof LichessConnectionError?error.message:"Lichess connection unavailable",
    code:error instanceof LichessConnectionError?error.code:"DATABASE_ERROR",
  },{status:error instanceof LichessConnectionError?error.status:500});
}
export async function GET(){
  const id=await teacher();
  if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {return NextResponse.json(await lichessConnectionStatus(id));}
  catch(error){return fail(error);}
}
export async function DELETE(req:NextRequest){
  const id=await teacher();
  if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).some(key=>key!=="confirmed")||body.confirmed!==true)
    return NextResponse.json({error:"Explicit teacher confirmation required"},{status:400});
  try {return NextResponse.json(await disconnectLichess(id));}
  catch(error){return fail(error);}
}
