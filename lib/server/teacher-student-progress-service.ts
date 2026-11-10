import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherStudentProfile} from "@/lib/server/student-profile-service";
import {skillDimensionsList,studentSkillAssessmentsList} from "@/lib/server/teacher-skills-service";
import {teacherMaterialAggregate} from "@/lib/server/teacher-material-history";

/**
 * One teacher-owned student, one explicit evidence model. No AI estimation,
 * material-mastery inference, hidden notes or guardian contacts.
 */
export async function teacherStudentProgressReport(
 db:SupabaseClient,teacherId:string,studentId:string
){
 const student=await teacherStudentProfile(db,teacherId,studentId);
 const [dimensions,assessments,materials]=await Promise.all([
   skillDimensionsList(db,teacherId),
   studentSkillAssessmentsList(db,teacherId,studentId),
   teacherMaterialAggregate(db,teacherId,{
     studentId,includeVoided:false,offset:0,limit:100,
   }),
 ]);
 const byDimension=new Map<string,{rating:number;assessedOn:string;observations:number}>();
 for(const row of assessments){
   const prior=byDimension.get(row.dimension_id);
   byDimension.set(row.dimension_id,{
     rating:row.rating,assessedOn:row.assessed_on,
     observations:(prior?.observations??0)+1,
   });
 }
 return {
   student:{id:student.id,name:student.name,level:student.level,
     strength:student.strength,lichessUsername:student.lichess_username,
     chesscomUsername:student.chesscom_username,
     lichessRating:student.lichess_rating,chesscomRating:student.chesscom_rating,
     chessGoals:student.chess_goals,chessRatings:student.chess_ratings,
     archived:Boolean(student.archived_at)},
   skills:dimensions.map(d=>({
     dimensionId:d.id,name:d.name,sortOrder:d.sort_order,
     latestRating:byDimension.get(d.id)?.rating??null,
     assessedOn:byDimension.get(d.id)?.assessedOn??null,
     observations:byDimension.get(d.id)?.observations??0,
   })),
   materials,
   truthBasis:"teacher_attested_only",
   caveat:"Study links, ratings and scheduled lessons do not prove mastery. Material coverage requires explicit teacher-recorded evidence.",
 };
}
