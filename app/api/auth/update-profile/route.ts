import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherProfileUpdate,TeacherProfileError} from "@/lib/server/teacher-profile-service";
import {localeCookie, isAppLocale} from "@/i18n/locales";

export async function PUT(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Not authenticated"},{status:401});
 const raw=await req.json().catch(()=>null);
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
   return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{
   const result=await teacherProfileUpdate(db,user.id,raw);
   const response=NextResponse.json(result);
   if(isAppLocale(raw.preferredLocale)) response.cookies.set(localeCookie,raw.preferredLocale,{
     httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",
     path:"/",maxAge:60*60*24*365,
   });
   return response;
 }catch(error){
   return NextResponse.json({error:error instanceof TeacherProfileError?
     error.message:"Failed to update profile"},{
     status:error instanceof TeacherProfileError?error.status:500,
   });
 }
}
