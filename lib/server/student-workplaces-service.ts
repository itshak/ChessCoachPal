import type {SupabaseClient} from "@supabase/supabase-js";
import {CoachError} from "@/lib/server/coach-service";
import {lifecyclePreviewSchema,studentLifecyclePreview} from "@/lib/server/student-lifecycle-service";

export const studentWorkplacesSchema=lifecyclePreviewSchema;
type Period={membershipId:string;workplaceId:string;startsOn:string|null;endsOn:string|null;revision:number};
type LifecycleMemberships={studentId:string;archived:boolean;teacherLocalToday:string;
 currentMemberships:Period[];futureMemberships:Period[];previousWorkplaceIds:string[]};
type Workplace={id:string;name:string;timezone:string;archived_at:string|null};
const limit=1000;
const unavailable=()=>new CoachError("DATABASE_ERROR",503,"Student workplaces unavailable");
const safePeriods=(rows:Period[],workplaceId:string)=>rows.filter(period=>period.workplaceId===workplaceId)
 .map(({membershipId,startsOn,endsOn,revision})=>({membershipId,startsOn,endsOn,revision}));

/**
 * A teacher-calendar membership read, not an authorization to enroll. Source
 * historical observations have their own label and never imply a current
 * period. SQL identifies the owning student; other returned fields are an
 * explicit privacy-minimized projection (no credit packages or private data).
 */
export async function studentWorkplacesList(db:SupabaseClient,teacherId:string,input:{studentId:string}){
 const {studentId}=studentWorkplacesSchema.parse(input);
 const lifecycle=await studentLifecyclePreview(db,teacherId,{studentId}) as LifecycleMemberships|null;
 if(!lifecycle)throw unavailable();
 const attributed=await db.from("workplaces")
  .select("id,name,timezone,archived_at,evidence:ccp_historical_attendance_evidence!ccp_historical_teacher_workplace!inner(id)")
  .eq("teacher_id",teacherId).eq("evidence.teacher_id",teacherId).eq("evidence.student_id",studentId)
  .order("id").limit(1,{referencedTable:"evidence"}).limit(limit);
 if(attributed.error||(attributed.data??[]).length>=limit)throw unavailable();
 const evidenceIds=new Set((attributed.data??[]).map(workplace=>workplace.id as string));
 const relationshipIds=new Set([...lifecycle.previousWorkplaceIds,
  ...lifecycle.currentMemberships.map(period=>period.workplaceId),
  ...lifecycle.futureMemberships.map(period=>period.workplaceId)]);
 if(relationshipIds.size>=limit)throw unavailable();
 const records=new Map<string,Workplace>((attributed.data??[]).map(workplace=>[workplace.id,workplace]));
 const missing=[...relationshipIds].filter(id=>!records.has(id));
 // Chunk the bounded owner UUID filter to avoid a long PostgREST URL.
 for(let offset=0;offset<missing.length;offset+=100){
  const own=await db.from("workplaces").select("id,name,timezone,archived_at")
   .eq("teacher_id",teacherId).in("id",missing.slice(offset,offset+100));
  if(own.error)throw unavailable();
  for(const item of own.data??[])records.set(item.id,item);
 }
 const previous=new Set(lifecycle.previousWorkplaceIds);
 const workplaces=[...records.values()].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.id.localeCompare(b.id))
  .map(workplace=>{
   const archived=workplace.archived_at!==null;
   const currentPeriods=lifecycle.archived||archived?[]:safePeriods(lifecycle.currentMemberships,workplace.id);
   const futurePeriods=lifecycle.archived||archived?[]:safePeriods(lifecycle.futureMemberships,workplace.id);
   const hasCurrentEnrollment=currentPeriods.length>0,hasHistoricalEvidence=evidenceIds.has(workplace.id);
   return {workplaceId:workplace.id,name:workplace.name,timezone:workplace.timezone,archived,
    currentPeriods,futurePeriods,hasCurrentEnrollment,hasStartedMembership:previous.has(workplace.id),
    hasHistoricalEvidence,historicalWithoutCurrentEnrollment:hasHistoricalEvidence&&!hasCurrentEnrollment};
  });
 return {studentId,studentArchived:lifecycle.archived,teacherLocalToday:lifecycle.teacherLocalToday,
  currentWorkplaceIds:workplaces.filter(workplace=>workplace.hasCurrentEnrollment).map(workplace=>workplace.workplaceId),
  workplaces};
}
