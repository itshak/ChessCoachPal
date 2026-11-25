import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {commitProfessionalRecurrence,previewProfessionalRecurrence,ProfessionalRecurrenceError,
 recurrenceCommitSchema,recurrencePreviewSchema} from "@/lib/server/professional-recurrence";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
async function handle(req:NextRequest,commit:boolean){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({code:"UNAUTHENTICATED",error:"Unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 try{
  if(commit){
   const parsed=recurrenceCommitSchema.safeParse(body);
   if(parsed.success)return NextResponse.json(await commitProfessionalRecurrence(db,parsed.data),{headers});
  }else{
   const parsed=recurrencePreviewSchema.safeParse(body);
   if(parsed.success)return NextResponse.json(await previewProfessionalRecurrence(db,parsed.data),{headers});
  }
  return NextResponse.json({code:"VALIDATION_ERROR",error:"Invalid scoped recurrence request"},{status:400,headers});
 }catch(error){
  if(error instanceof ProfessionalRecurrenceError)
   return NextResponse.json({code:error.code,error:error.message},{status:error.status,headers});
  return NextResponse.json({code:"RECURRENCE_UNAVAILABLE",error:"Recurrence could not be verified"},{status:503,headers});
 }
}
export async function POST(req:NextRequest){return handle(req,false);}
export async function PUT(req:NextRequest){return handle(req,true);}
