import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {portalEventInviteRevokeSchema,teacherPortalEventInviteRevoke}
  from "@/lib/server/portal-event-invitations";
import {PortalGrantError} from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string;inviteId:string}>}){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const body=parseBody(portalEventInviteRevokeSchema,await req.json().catch(()=>null));
  if(!body.ok)return body.response;
  try{
    const {id,inviteId}=await params;
    return NextResponse.json(await teacherPortalEventInviteRevoke(db,user.id,id,inviteId,body.data),
      {headers:{"Cache-Control":"no-store"}});
  }catch(e){return NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},
    {status:e instanceof PortalGrantError?e.status:500,headers:{"Cache-Control":"no-store"}});}
}
