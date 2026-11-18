import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {browserApiOrigin} from "@/lib/server/http";
import {parseBody} from "@/lib/server/api-schemas";
import {payerAssignmentEndSchema,payerAssignmentEnd,PayerAssignmentError}
 from "@/lib/server/student-billing-assignments-service";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string;assignmentId:string}>}){
 if(req.headers.get("origin")!==browserApiOrigin(req))
  return NextResponse.json({error:"FORBIDDEN"},{status:403,headers});
 const {id,assignmentId}=await params,db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 const parsed=parseBody(payerAssignmentEndSchema,await req.json().catch(()=>null));
 if(!parsed.ok)return parsed.response;
 if(parsed.data.studentId!==id||parsed.data.assignmentId!==assignmentId)
  return NextResponse.json({error:"Assignment mismatch"},{status:400,headers});
 try{return NextResponse.json(await payerAssignmentEnd(db,user.id,parsed.data),{headers});}
 catch(e){return NextResponse.json({error:e instanceof PayerAssignmentError?e.message:"Unable to end payer",
  code:e instanceof PayerAssignmentError?e.code:"DATABASE_ERROR"},
  {status:e instanceof PayerAssignmentError?e.status:500,headers});}
}
