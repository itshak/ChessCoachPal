import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CalendarError } from "@/lib/server/legacy-calendar-service";
async function teacher(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 return user?{db,id:user.id}:null;
}
const failure=(error:unknown)=>NextResponse.json({
 error:error instanceof CalendarError?error.message:"Calendar unavailable",
 code:error instanceof CalendarError?error.code:"DATABASE_ERROR",
},{status:error instanceof CalendarError?error.status:500});
import { calendarSlotsList, calendarSlotCreate, type SlotCreate } from "@/lib/server/legacy-calendar-service";
export async function GET(req:NextRequest){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{const q=req.nextUrl.searchParams;return NextResponse.json(await calendarSlotsList(auth.db,auth.id,{
   studentId:q.get("studentId")||undefined,activeOnly:q.get("activeOnly")==="true",
 }));}catch(error){return failure(error);}
}
export async function POST(req:NextRequest){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{return NextResponse.json(await calendarSlotCreate(auth.db,auth.id,body as SlotCreate));}
 catch(error){return failure(error);}
}
