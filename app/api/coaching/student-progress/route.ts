import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {teacherStudentProgressReport} from "@/lib/server/teacher-student-progress-service";
import {StudentProfileError} from "@/lib/server/student-profile-service";
import {TeacherSkillsError} from "@/lib/server/teacher-skills-service";
import {MaterialHistoryError} from "@/lib/server/teacher-material-history";

export async function GET(req:NextRequest){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const studentId=req.nextUrl.searchParams.get("studentId")??"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId))
   return NextResponse.json({error:"Valid studentId required"},{status:400});
 try{
   return NextResponse.json(await teacherStudentProgressReport(db,user.id,studentId),{
     headers:{"Cache-Control":"private, no-store"},
   });
 }catch(error){
   const status=error instanceof StudentProfileError||
     error instanceof TeacherSkillsError||error instanceof MaterialHistoryError
     ?error.status:500;
   return NextResponse.json({error:status===404?"Student not found":"Progress report unavailable"},{status});
 }
}
