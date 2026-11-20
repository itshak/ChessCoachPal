import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {portalGrantIssueSchema} from "@/lib/server/portal-grant-schemas";
import {teacherPortalGrantIssueBrowserOnly,PortalGrantError}
  from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
/** Browser-only credentials: NEVER through MCP and NEVER cache. */
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const parsed=parseBody(portalGrantIssueSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{
    const {grant,secret}=await teacherPortalGrantIssueBrowserOnly(db,user.id,(await params).id,
      parsed.data.expectedRevision);
    // Only the link secret's issue response contains the raw token; no DB,
    // logs, MCP, emails or analytics should persist it.
    const url=new URL(`/portal/${encodeURIComponent(secret)}`,browserApiOrigin(req)).href;
    return NextResponse.json({grant,url},{headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch(e){return NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},{
    status:e instanceof PortalGrantError?e.status:500,headers:{"Cache-Control":"no-store"}});}
}
