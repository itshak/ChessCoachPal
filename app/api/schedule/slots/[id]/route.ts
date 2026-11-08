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
import { calendarSlotUpdate, calendarSlotDelete, type SlotPatch } from "@/lib/server/legacy-calendar-service";
type Context={params:Promise<{id:string}>};
export async function PUT(req:NextRequest,{params}:Context){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{return NextResponse.json(await calendarSlotUpdate(auth.db,auth.id,(await params).id,body as SlotPatch));}
 catch(error){return failure(error);}
}
export async function DELETE(_req:NextRequest,{params}:Context){
 const auth=await teacher();if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json(await calendarSlotDelete(auth.db,auth.id,(await params).id));}
 catch(error){return failure(error);}
}
