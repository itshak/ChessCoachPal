import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getPolicy} from "@/lib/server/scheduling";
import {workplacesList} from "@/lib/server/coach-service";
import {toLocalDateString,dayOfWeek} from "@/lib/schedule";
import {isAppLocale} from "@/i18n/locales";

/** A trusted server clock, never a model's inferred "today". */
export async function teacherContextGet(db:SupabaseClient,teacherId:string){
 const [policy,workplaces,teacher]=await Promise.all([
  getPolicy(db,teacherId),workplacesList(db,teacherId),
  db.from("teachers").select("preferred_locale").eq("id",teacherId).maybeSingle(),
 ]);
 const localDate=toLocalDateString(new Date(),policy.timezone);
 return {teacherId,localDate,dayOfWeek:dayOfWeek(localDate),timezone:policy.timezone,
  preferredLocale:isAppLocale(teacher.data?.preferred_locale)?teacher.data.preferred_locale:"en",
  utcNow:new Date().toISOString(),workplaces,
  note:"Respect the teacher's explicit message language for prose; otherwise default to preferredLocale (en/he/ru). Preserve names, aliases and chess notation verbatim. The teacher's local date and workplace timezones are authoritative. Context does not imply attendance or consent."};
}
