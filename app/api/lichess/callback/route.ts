import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
  LICHESS_HANDOFF_COOKIE,authorizeLichessCallback,finishLichessAuthorization,
} from "@/lib/server/lichess-connections";
import {oauthOrigin} from "@/lib/server/agent-oauth-core";

export async function GET(req:NextRequest) {
  const result=(status:string)=>{
    const url=new URL("/learning",oauthOrigin());
    url.searchParams.set("lichess",status);
    const response=NextResponse.redirect(url,303);
    response.cookies.delete(LICHESS_HANDOFF_COOKIE);
    return response;
  };
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return result("authentication-required");
  if(req.nextUrl.searchParams.has("error"))return result("permission-denied");
  try {
    const {verifier,scopes}=authorizeLichessCallback(
      req.cookies.get(LICHESS_HANDOFF_COOKIE)?.value,user.id,
      req.nextUrl.searchParams.get("state")??undefined,
    );
    const code=req.nextUrl.searchParams.get("code");
    if(!code)return result("missing-code");
    await finishLichessAuthorization(user.id,code,verifier,scopes);
    return result("connected");
  }catch{return result("connection-failed");}
}
