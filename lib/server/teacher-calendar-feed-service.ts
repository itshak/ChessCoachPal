import type {SupabaseClient} from "@supabase/supabase-js";
import {generateShortToken} from "@/lib/token";

/** Calendar feed URLs are bearer secrets. MCP can revoke/rotate without ever
 * returning the replacement token to the model. */
export class CalendarFeedTokenError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
export async function teacherCalendarFeedStatus(db:SupabaseClient,teacherId:string){
 const {data,error}=await db.from("teachers").select("calendar_token")
  .eq("id",teacherId).maybeSingle();
 if(error)throw new CalendarFeedTokenError(500,"DATABASE_ERROR","Calendar feed unavailable");
 if(!data)throw new CalendarFeedTokenError(404,"NOT_FOUND","Teacher not found");
 return {configured:Boolean(data.calendar_token),secretNotReturned:true};
}
export async function teacherCalendarFeedRotate(
 db:SupabaseClient,teacherId:string,revealToAuthenticatedWebsite=false
){
 const token=generateShortToken();
 const {data,error}=await db.from("teachers")
  .update({calendar_token:token}).eq("id",teacherId)
  .select("id,calendar_token").maybeSingle();
 if(error)throw new CalendarFeedTokenError(500,"DATABASE_ERROR","Calendar feed rotation failed");
 if(!data)throw new CalendarFeedTokenError(404,"NOT_FOUND","Teacher not found");
 if(revealToAuthenticatedWebsite)return data;
 return {ok:true,rotated:true,secretNotReturned:true};
}
