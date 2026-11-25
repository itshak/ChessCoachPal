import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {commitProfessionalOccurrenceCancellation,previewProfessionalOccurrenceCancellation,
 occurrenceCancellationCommitSchema,occurrenceCancellationPreviewSchema,ProfessionalOccurrenceCancellationError,
} from "@/lib/server/professional-occurrence-cancellation";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
async function handle(req:NextRequest,commit:boolean){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({code:"UNAUTHENTICATED",error:"Unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 try{
  if(commit){
   const parsed=occurrenceCancellationCommitSchema.safeParse(body);
   if(parsed.success)return NextResponse.json(await commitProfessionalOccurrenceCancellation(db,parsed.data),{headers});
  }else{
   const parsed=occurrenceCancellationPreviewSchema.safeParse(body);
   if(parsed.success)return NextResponse.json(await previewProfessionalOccurrenceCancellation(db,user.id,parsed.data),{headers});
  }
  return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid occurrence cancellation request"},{status:400,headers});
 }catch(error){
  if(error instanceof ProfessionalOccurrenceCancellationError)
   return NextResponse.json({code:error.code,error:error.message},{status:error.status,headers});
  return NextResponse.json({code:"OCCURRENCE_CANCELLATION_UNAVAILABLE",error:"The result could not be verified"},{status:503,headers});
 }
}
export async function POST(req:NextRequest){return handle(req,false);}
export async function PUT(req:NextRequest){return handle(req,true);}
