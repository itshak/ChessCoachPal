import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {portalGrantCreateSchema} from "@/lib/server/portal-grant-schemas";
import {teacherPortalGrantsList,teacherPortalGrantCreate,PortalGrantError}
  from "@/lib/server/portal-grants-service";
import {browserApiOrigin} from "@/lib/server/http";
export const dynamic="force-dynamic";
const opts={headers:{"Cache-Control":"no-store"}};
function failure(e:unknown){return NextResponse.json({error:e instanceof PortalGrantError?e.code:"DATABASE_ERROR"},
  {...opts,status:e instanceof PortalGrantError?e.status:500});}
export async function GET(req:NextRequest){
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const contactId=req.nextUrl.searchParams.get("contactId")??undefined;
  const studentId=req.nextUrl.searchParams.get("studentId")??undefined;
  if(contactId&&!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(contactId))
    return NextResponse.json({error:"INVALID_CONTACT"},{status:400});
  if(studentId&&!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(studentId))
    return NextResponse.json({error:"INVALID_STUDENT"},{status:400});
  try{return NextResponse.json(await teacherPortalGrantsList(db,user.id,contactId,studentId),opts);}
  catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
  if(req.headers.get("origin")!==browserApiOrigin(req))
    return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const db=await createClient(),{data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  const parsed=parseBody(portalGrantCreateSchema,await req.json().catch(()=>null));
  if(!parsed.ok)return parsed.response;
  try{return NextResponse.json(await teacherPortalGrantCreate(db,user.id,parsed.data),
    {...opts,status:201});}
  catch(e){return failure(e);}
}
