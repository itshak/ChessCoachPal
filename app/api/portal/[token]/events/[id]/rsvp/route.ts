import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/lib/supabase/server";
import {rejectIfTokenLookupsBlocked,recordTokenLookupFailure}
  from "@/lib/server/token-guard";
import {portalAuthorizeToken} from "@/lib/server/portal-grants-service";
export const dynamic="force-dynamic";
const schema=z.object({
  status:z.enum(["yes","no","maybe"]),
  partySize:z.number().int().min(1).max(99).nullable().default(null),
  note:z.string().max(1000).default(""),
}).strict();
const headers={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
/** Guest can RSVP only to an explicit, future, workplace-scoped invitation. */
export async function POST(req:NextRequest,{params}:{params:Promise<{token:string;id:string}>}){
  const blocked=rejectIfTokenLookupsBlocked(req);
  if(blocked)return blocked;
  const {token,id}=await params;
  const parsed=schema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"VALIDATION_ERROR"},{status:400,headers});
  const db=createServiceClient();
  const grant=await portalAuthorizeToken(db,token);
  if(!grant||!grant.permissions.has("event_rsvp")){
    recordTokenLookupFailure(req);
    return NextResponse.json({error:"NOT_FOUND"},{status:404,headers});
  }
  const {data,error}=await db.rpc("ccp_scoped_portal_rsvp",{
    p_grant_secret:token,p_event_id:id,p_status:parsed.data.status,
    p_party_size:parsed.data.partySize,p_note:parsed.data.note.trim(),
  });
  if(error){
    if(error.code==="42501"||error.message.includes("PORTAL_NOT_FOUND")){
      recordTokenLookupFailure(req);
      return NextResponse.json({error:"NOT_FOUND"},{status:404,headers});
    }
    if(error.code==="22023"||error.message.includes("PORTAL_INVALID_RSVP"))
      return NextResponse.json({error:"VALIDATION_ERROR"},{status:400,headers});
    return NextResponse.json({error:"RSVP_UNAVAILABLE"},{status:503,headers});
  }
  return NextResponse.json({ok:!!data?.ok,replayed:!!data?.replayed},
    {headers});
}
