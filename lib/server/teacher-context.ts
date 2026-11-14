import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getPolicy} from "@/lib/server/scheduling";
import {workplacesList} from "@/lib/server/coach-service";
import {toLocalDateString,dayOfWeek} from "@/lib/schedule";

/** A trusted server clock, never a model's inferred "today". */
export async function teacherContextGet(db:SupabaseClient,teacherId:string){
 const [policy,workplaces]=await Promise.all([
  getPolicy(db,teacherId),workplacesList(db,teacherId),
 ]);
 const localDate=toLocalDateString(new Date(),policy.timezone);
 return {localDate,dayOfWeek:dayOfWeek(localDate),timezone:policy.timezone,
  utcNow:new Date().toISOString(),workplaces,
  note:"The teacher's local date and listed workplace timezones are authoritative; select a real date for scheduling. Context does not imply attendance or consent."};
}
