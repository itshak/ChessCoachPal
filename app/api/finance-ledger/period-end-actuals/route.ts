import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {financePeriodEndActuals,financePeriodEndActualsSchema} from "@/lib/server/finance-period-end-actuals";
import {FinanceLedgerError} from "@/lib/server/finance-ledger-service";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(req:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers});
 const params=req.nextUrl.searchParams;
 const entries=[...params];
 const parsed=financePeriodEndActualsSchema.safeParse(Object.fromEntries(entries));
 if(!parsed.success||new Set(entries.map(([key])=>key)).size!==entries.length)
  return NextResponse.json({code:"INVALID_PERIOD_END_ACTUALS_SCOPE"},{status:400,headers});
 try{return NextResponse.json(await financePeriodEndActuals(db,parsed.data),{headers});}
 catch(error){
  const known=error instanceof FinanceLedgerError;
  return NextResponse.json({code:known?error.code:"PERIOD_END_ACTUALS_UNAVAILABLE"},
   {status:known?error.status:503,headers});
 }
}
