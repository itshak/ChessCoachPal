import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {createServiceClient} from "@/lib/supabase/server";
import {cancelCanonicalParticipant,CanonicalPortalError}
 from "@/lib/server/canonical-portal-service";
import {rejectIfTokenLookupsBlocked,recordTokenLookupFailure}
 from "@/lib/server/token-guard";

const schema=z.object({note:z.string().max(1000).optional()}).strict();
type Context={params:Promise<{token:string;id:string;studentId:string}>};

/** Never return guardian-token diagnostics, teacher IDs, or private notes. */
export async function POST(req:NextRequest,{params}:Context){
 const blocked=rejectIfTokenLookupsBlocked(req);
 if(blocked)return blocked;
 const parsed=schema.safeParse(await req.json().catch(()=>({})));
 if(!parsed.success)return NextResponse.json(
  {error:"Cancellation note must be at most 1000 characters"},
  {status:400,headers:{"Cache-Control":"no-store"}});
 const {token,id,studentId}=await params;
 try{
  const result=await cancelCanonicalParticipant(
   createServiceClient(),token,id,studentId,parsed.data.note??"");
  return NextResponse.json({
   ok:result.ok,noticeAt:result.noticeAt,replayed:result.replayed,
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  if(error instanceof CanonicalPortalError&&error.code==="NOT_FOUND")
   recordTokenLookupFailure(req);
  if(!(error instanceof CanonicalPortalError))
   console.error("Canonical portal cancellation failed");
  return NextResponse.json({
   error:error instanceof CanonicalPortalError?error.message:"Cancellation unavailable",
  },{status:error instanceof CanonicalPortalError?error.status:503,
    headers:{"Cache-Control":"no-store"}});
 }
}
