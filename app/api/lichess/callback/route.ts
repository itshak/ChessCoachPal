import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {
  LICHESS_HANDOFF_COOKIE,authorizeLichessCallback,finishLichessAuthorization,
} from "@/lib/server/lichess-connections";
import {oauthOrigin} from "@/lib/server/agent-oauth-core";

export async function GET(req:NextRequest) {
  const result=(status:string,returnTo:"learning"|"account"="learning")=>{
    const url=new URL(returnTo==="account"?"/account":"/learning",oauthOrigin());
    url.searchParams.set("lichess",status);
    const response=NextResponse.redirect(url,303);
    response.cookies.delete(LICHESS_HANDOFF_COOKIE);
    return response;
  };
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return result("authentication-required");
  try {
    const {verifier,scopes,returnTo}=authorizeLichessCallback(
      req.cookies.get(LICHESS_HANDOFF_COOKIE)?.value,user.id,
      req.nextUrl.searchParams.get("state")??undefined,
    );
    if(req.nextUrl.searchParams.has("error"))return result("permission-denied",returnTo);
    const code=req.nextUrl.searchParams.get("code");
    if(!code)return result("missing-code",returnTo);
    await finishLichessAuthorization(user.id,code,verifier,scopes);
    return result("connected",returnTo);
  }catch{return result("connection-failed");}
}
