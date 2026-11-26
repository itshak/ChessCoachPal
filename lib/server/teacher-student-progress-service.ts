import type {SupabaseClient} from "@supabase/supabase-js";
import {belongsToCurrentOnlineRating,readOnlineRatingFreshness} from "./online-rating-freshness";
import {teacherStudentProfile} from "@/lib/server/student-profile-service";
import {skillDimensionsList,studentSkillAssessmentsList} from "@/lib/server/teacher-skills-service";
import {teacherMaterialAggregate} from "@/lib/server/teacher-material-history";
import {teacherHistoricalAttendanceSummary} from "@/lib/server/teacher-historical-attendance";

type ReportSnapshot={
 id:string;provider:string;time_control:string;rating:number;source:string;observed_at:string;
 fetched_at:string|null;source_username:string|null;source_handle_revision:number|null;
};

/**
 * Teacher-owned, source-backed evidence. Platform snapshots and manually
 * entered profile ratings remain distinguishable; neither changes strength
 * or implies mastery. The same report service powers website and MCP.
 */
export async function teacherStudentProgressReport(
 db:SupabaseClient,teacherId:string,studentId:string
){
 const student=await teacherStudentProfile(db,teacherId,studentId);
 const now=Date.now();
 const [dimensions,materials,snapshotsResult,historicalAttendance,freshness]=await Promise.all([
   skillDimensionsList(db,teacherId),
   teacherMaterialAggregate(db,teacherId,{
     studentId,includeVoided:false,offset:0,limit:100,
   }),
   db.from("student_rating_snapshots")
     .select("id,provider,time_control,rating,source,observed_at,created_at,fetched_at,source_username,source_handle_revision")
     .eq("teacher_id",teacherId).eq("student_id",studentId)
     .order("observed_at",{ascending:false})
     .order("created_at",{ascending:false}).order("id",{ascending:false})
     .limit(5001).overrideTypes<ReportSnapshot[],{merge:false}>(),
   teacherHistoricalAttendanceSummary(db,teacherId,{studentId}),
   readOnlineRatingFreshness(db,teacherId,studentId,student,now),
 ]);
 if(snapshotsResult.error)throw new Error("Student rating snapshot summary unavailable");
 if((snapshotsResult.data?.length??0)>5000)
   throw new Error("Student rating history exceeds safe report limit (5000 observations)");
 const latestPlatformRatings:Array<{
   provider:string;timeControl:string;rating:number;
   source:string;observedAt:string;snapshotId:string;
 }>=[];
 const observed=new Set<string>();
 for(const row of snapshotsResult.data??[]){
   if(row.source==="provider_api"&&(row.provider==="lichess"||row.provider==="chesscom")&&
     !belongsToCurrentOnlineRating(freshness.states[row.provider],row,now))
    continue;
   const key=row.provider+":"+row.time_control;
   if(observed.has(key))continue;
   observed.add(key);
   latestPlatformRatings.push({
     provider:row.provider,timeControl:row.time_control,
     rating:row.rating,source:row.source,observedAt:row.observed_at,
     snapshotId:row.id,
   });
 }
 const byControl:Record<string,Record<string,number|null>>={};
 for(const [provider,values] of Object.entries(student.chess_ratings??{})){
   if(values&&typeof values==="object"&&!Array.isArray(values))
     byControl[provider]={...(values as Record<string,number|null>)};
 }
 for(const row of latestPlatformRatings){
   byControl[row.provider]??={};
   // Explicit teacher-entered ratings take precedence over snapshots.
   if(!(row.timeControl in byControl[row.provider]))
     byControl[row.provider][row.timeControl]=row.rating;
 }
 const rapidRating=(provider:string)=>
   latestPlatformRatings.find(row=>row.provider===provider&&row.timeControl==="rapid")?.rating??null;
 const lichessRating=student.lichess_rating??rapidRating("lichess");
 const chesscomRating=student.chesscom_rating??rapidRating("chesscom");
 const lichessRatingSource=student.lichess_rating!==null&&student.lichess_rating!==undefined
   ?"teacher_profile":lichessRating===null?"unset":"latest_rapid_snapshot";
 const chesscomRatingSource=student.chesscom_rating!==null&&student.chesscom_rating!==undefined
   ?"teacher_profile":chesscomRating===null?"unset":"latest_rapid_snapshot";

 // The old implementation only read the first 1000 assessments and silently
 // truncated longer history. Always return a complete bounded history.
 const assessments:Awaited<ReturnType<typeof studentSkillAssessmentsList>>=[];
 for(let offset=0;offset<=5000;offset+=1000){
   const page=await studentSkillAssessmentsList(db,teacherId,studentId,{offset,limit:1000});
   if(offset+page.length>5000)
     throw new Error("Student assessments exceed safe report limit (5000 observations)");
   assessments.push(...page);
   if(page.length<1000)break;
   if(offset===5000)throw new Error("Student assessments exceed safe report limit (5000 observations)");
 }
 const byDimension=new Map<string,{
   rating:number;assessedOn:string;observations:number;
   trend:Array<{id:string;rating:number;assessedOn:string}>;
 }>();
 for(const row of assessments){
   const prior=byDimension.get(row.dimension_id);
   byDimension.set(row.dimension_id,{
     rating:row.rating,assessedOn:row.assessed_on,
     observations:(prior?.observations??0)+1,
     trend:[...(prior?.trend??[]),{
       id:row.id,rating:row.rating,assessedOn:row.assessed_on,
     }],
   });
 }
 return {
   student:{id:student.id,name:student.name,level:student.level,
     strength:student.strength,lichessUsername:student.lichess_username,
     chesscomUsername:student.chesscom_username,
     lichessRating,chesscomRating,
     chessGoals:student.chess_goals,chessRatings:byControl,
     ratingSources:{lichessRating:lichessRatingSource,chesscomRating:chesscomRatingSource},
     archived:Boolean(student.archived_at)},
   latestPlatformRatings,
   providerFreshness:freshness.providers,
   historicalAttendance,
   skills:dimensions.map(d=>({
     dimensionId:d.id,name:d.name,sortOrder:d.sort_order,
     latestRating:byDimension.get(d.id)?.rating??null,
     assessedOn:byDimension.get(d.id)?.assessedOn??null,
     observations:byDimension.get(d.id)?.observations??0,
     trend:byDimension.get(d.id)?.trend??[],
   })),
   materials,
   truthBasis:"teacher_attested_only",
   caveat:"Historical attendance contains separately sourced dated evidence and aggregate-only counts; neither creates calendar sessions or implies mastery. Snapshot ratings are reported by provider/time control and may be teacher-entered or provider-sourced. Online provider snapshots shown here require the current permitted binding. Manual entries are historical observations. A rapid snapshot only fills an empty profile rating; it never changes strength. Study links, ratings and scheduled lessons do not prove mastery. Material coverage requires explicit teacher-recorded evidence.",
 };
}
