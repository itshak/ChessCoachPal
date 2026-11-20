import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {financeLedgerList,FinanceLedgerError} from "@/lib/server/finance-ledger-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(_req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 try{return NextResponse.json(await financeLedgerList(db,user.id),{headers});}
 catch(e){return NextResponse.json({error:e instanceof FinanceLedgerError?e.message:"Financial records unavailable",
  code:e instanceof FinanceLedgerError?e.code:"DATABASE_ERROR"},
  {status:e instanceof FinanceLedgerError?e.status:500,headers});}
}
