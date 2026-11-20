import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {payerAssignmentListSchema,payerAssignmentCreateSchema,
 payerAssignmentsList,payerAssignmentCreate,PayerAssignmentError}
 from "@/lib/server/student-billing-assignments-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
const failure=(e:unknown)=>NextResponse.json({error:e instanceof PayerAssignmentError?e.message:"Payer data unavailable",
 code:e instanceof PayerAssignmentError?e.code:"DATABASE_ERROR"},
 {status:e instanceof PayerAssignmentError?e.status:500,headers});
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 const parsed=payerAssignmentListSchema.safeParse({studentId:id,
  workplaceId:req.nextUrl.searchParams.get("workplaceId")??undefined});
 if(!parsed.success)return NextResponse.json({error:"Invalid payer filter"},{status:400,headers});
 try{return NextResponse.json(await payerAssignmentsList(db,user.id,parsed.data),{headers});}
 catch(e){return failure(e);}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
 const {id}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 const parsed=parseBody(payerAssignmentCreateSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 if(parsed.data.studentId!==id)return NextResponse.json({error:"Student mismatch"},{status:400,headers});
 try{return NextResponse.json(await payerAssignmentCreate(db,user.id,parsed.data),{status:201,headers});}
 catch(e){return failure(e);}
}
