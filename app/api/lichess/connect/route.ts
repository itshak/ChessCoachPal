import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {beginLichessAuthorization,LICHESS_HANDOFF_COOKIE} from "@/lib/server/lichess-connections";

export async function GET(req:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.redirect(new URL("/login",req.url),303);
  const mode=req.nextUrl.searchParams.get("mode")??"read";
  if(mode!=="read"&&mode!=="write")
    return NextResponse.json({error:"Invalid Lichess permission mode"},{status:400});
  try {
    const {authorizationUrl,cookie}=beginLichessAuthorization(user.id,mode);
    const response=NextResponse.redirect(authorizationUrl,303);
    response.cookies.set(LICHESS_HANDOFF_COOKIE,cookie,{
      httpOnly:true,sameSite:"lax",secure:new URL(req.url).protocol==="https:",
      path:"/api/lichess",maxAge:600,
    });
    return response;
  }catch{
    return NextResponse.json({error:"Unable to start Lichess authorization"},{status:500});
  }
}
