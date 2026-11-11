import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {materialArchivePreviewSchema,materialLifecycleSchema,
  teacherMaterialArchivePreview,teacherMaterialLifecycleChange,MaterialCatalogError
} from "@/lib/server/learning-materials";

async function auth(){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 return user?{db,teacherId:user.id}:null;
}
function errorResponse(error:unknown){
 const known=error instanceof MaterialCatalogError;
 return NextResponse.json({error:known?error.message:"Material archive unavailable",
   code:known?error.code:"DATABASE_ERROR"},{status:known?error.status:500});
}
export async function GET(request:NextRequest){
 const context=await auth();
 if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=materialArchivePreviewSchema.safeParse({
   materialId:request.nextUrl.searchParams.get("materialId"),
 });
 if(!parsed.success)return NextResponse.json({error:"Invalid material"},{status:400});
 try{
   return NextResponse.json(await teacherMaterialArchivePreview(
     context.db,context.teacherId,parsed.data.materialId),
     {headers:{"Cache-Control":"no-store"}});
 }catch(error){return errorResponse(error);}
}
export async function POST(request:NextRequest){
 const context=await auth();
 if(!context)return NextResponse.json({error:"Unauthorized"},{status:401});
 const parsed=materialLifecycleSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid archive action"},{status:400});
 try{
   return NextResponse.json(await teacherMaterialLifecycleChange(
      context.db,context.teacherId,parsed.data),
      {headers:{"Cache-Control":"no-store"}});
 }catch(error){return errorResponse(error);}
}
