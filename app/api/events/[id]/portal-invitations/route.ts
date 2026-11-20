import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {portalEventInviteCreateSchema,teacherPortalEventInvitesList,
  teacherPortalEventInviteCreate} from "@/lib/server/portal-event-invitations";
import {PortalGrantError} from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},
  {status:e instanceof PortalGrantError?e.status:500,headers:{"Cache-Control":"no-store"}});
export async function GET(_req:NextRequest,{params}:Context){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  try{return NextResponse.json(await teacherPortalEventInvitesList(db,user.id,(await params).id),
    {headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}
}
export async function POST(req:NextRequest,{params}:Context){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const body=parseBody(portalEventInviteCreateSchema,await req.json().catch(()=>null));
  if(!body.ok)return body.response;
  try{return NextResponse.json(await teacherPortalEventInviteCreate(db,user.id,
    (await params).id,body.data),{status:201,headers:{"Cache-Control":"no-store"}});
  }catch(e){return failure(e);}
}
