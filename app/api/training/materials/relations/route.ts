import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {materialRelationSchema,materialRelationListSchema,
  teacherMaterialRelationsList,teacherMaterialRelationChange,MaterialCatalogError
} from "@/lib/server/learning-materials";

function fail(error:unknown){
  const known=error instanceof MaterialCatalogError;
  return NextResponse.json({error:known?error.message:"Material relations unavailable",
    code:known?error.code:"DATABASE_ERROR"},{status:known?error.status:500});
}
async function authenticate(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
export async function GET(request:NextRequest){
  const context=await authenticate();
  if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=materialRelationListSchema.safeParse({
    materialId:request.nextUrl.searchParams.get("materialId"),
  });
  if(!parsed.success)return NextResponse.json({error:"Invalid material ID"},{status:400});
  try{
    return NextResponse.json(await teacherMaterialRelationsList(
      context.db,context.teacherId,parsed.data.materialId),
      {headers:{"Cache-Control":"no-store"}});
  }catch(error){return fail(error);}
}
export async function POST(request:NextRequest){
  const context=await authenticate();
  if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=materialRelationSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid material relation",issues:parsed.error.issues},{status:400});
  try{
    return NextResponse.json(await teacherMaterialRelationChange(
      context.db,context.teacherId,parsed.data),
      {headers:{"Cache-Control":"no-store"}});
  }catch(error){return fail(error);}
}
