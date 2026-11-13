import {NextRequest,NextResponse} from "next/server";
import {createServiceClient} from "@/lib/supabase/server";
import {secureCompare} from "@/lib/server/secure-compare";
import {deliverCanonicalOutbox} from "@/lib/server/canonical-delivery-outbox";

export const dynamic="force-dynamic";
export const maxDuration=60;

/** Operator- or scheduler-only endpoint; never callable through a teacher
 * OAuth token, guardian link or the anonymous browser.
 */
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET?.trim();
 if(!secret||!secureCompare(req.headers.get("authorization")??"",`Bearer ${secret}`))
  return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const result=await deliverCanonicalOutbox(createServiceClient(),{limit:10});
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  console.error("Canonical outbox cron failed:",e instanceof Error?e.name:"Error");
  return NextResponse.json({error:"Delivery queue temporarily unavailable"},
   {status:503,headers:{"Cache-Control":"no-store"}});
 }
}
export async function POST(req:NextRequest){return GET(req);}
