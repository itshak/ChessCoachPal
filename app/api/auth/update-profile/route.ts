import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherProfileUpdate,TeacherProfileError} from "@/lib/server/teacher-profile-service";

export async function PUT(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Not authenticated"},{status:401});
 const raw=await req.json().catch(()=>null);
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
   return NextResponse.json({error:"Invalid JSON"},{status:400});
 try{
   return NextResponse.json(await teacherProfileUpdate(db,user.id,raw));
 }catch(error){
   return NextResponse.json({error:error instanceof TeacherProfileError?
     error.message:"Failed to update profile"},{
     status:error instanceof TeacherProfileError?error.status:500,
   });
 }
}
