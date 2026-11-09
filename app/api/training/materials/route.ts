import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  materialCatalogCreateSchema,materialCatalogFilterSchema,
  teacherMaterialCatalogCreate,teacherMaterialCatalogGet,teacherMaterialCatalogList,
  MaterialCatalogError,
} from "@/lib/server/learning-materials";
import { z } from "zod";

async function authenticate() {
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  return user?{db,teacherId:user.id}:null;
}
function errorResponse(error:unknown) {
  return NextResponse.json({
    error:error instanceof MaterialCatalogError?error.message:"Learning materials unavailable",
    code:error instanceof MaterialCatalogError?error.code:"DATABASE_ERROR",
  },{status:error instanceof MaterialCatalogError?error.status:500});
}
export async function GET(request:NextRequest) {
  const context=await authenticate();
  if (!context) return NextResponse.json({error:"Unauthorized"},{status:401});
  const p=request.nextUrl.searchParams;
  try {
    if (p.has("id")) {
      const id=z.string().uuid().safeParse(p.get("id"));
      if (!id.success) return NextResponse.json({error:"Invalid material ID"},{status:400});
      return NextResponse.json(await teacherMaterialCatalogGet(context.db,context.teacherId,id.data),
        {headers:{"Cache-Control":"no-store"}});
    }
    const params=materialCatalogFilterSchema.safeParse({
      kind:p.get("kind")||undefined,query:p.get("query")||undefined,
      limit:Number(p.get("limit")??30),offset:Number(p.get("offset")??0),
    });
    if (!params.success) return NextResponse.json({error:"Invalid material filter"},{status:400});
    return NextResponse.json(await teacherMaterialCatalogList(context.db,context.teacherId,params.data),
      {headers:{"Cache-Control":"no-store"}});
  } catch(error) {return errorResponse(error);}
}
export async function POST(request:NextRequest) {
  const context=await authenticate();
  if (!context) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=materialCatalogCreateSchema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"Invalid typed material",issues:parsed.error.issues},{status:400});
  try {
    const created=await teacherMaterialCatalogCreate(context.db,context.teacherId,parsed.data);
    return NextResponse.json(created,{status:created.replayed?200:201});
  } catch(error) {return errorResponse(error);}
}
