import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseBody} from "@/lib/server/api-schemas";
import {browserApiOrigin} from "@/lib/server/http";
import {paymentAllocationSchema,paymentAllocate,FinanceLedgerError} from "@/lib/server/finance-ledger-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 const parsed=parseBody(paymentAllocationSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 try{return NextResponse.json(await paymentAllocate(db,user.id,parsed.data),{status:201,headers});}
 catch(e){return NextResponse.json({
  error:e instanceof FinanceLedgerError?e.message:"Financial record unavailable",
  code:e instanceof FinanceLedgerError?e.code:"DATABASE_ERROR"},
  {status:e instanceof FinanceLedgerError?e.status:500,headers});}
}
