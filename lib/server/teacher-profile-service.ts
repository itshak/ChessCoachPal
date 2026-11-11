import type {SupabaseClient} from "@supabase/supabase-js";

/** Ordinary teacher profile fields. Authentication secrets, sign-in email,
 * passwords and MFA are deliberately not accessible through this service. */
export class TeacherProfileError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
export async function teacherProfileGet(db:SupabaseClient,teacherId:string){
 const {data,error}=await db.from("teachers")
  .select("id,display_name,avatar_url").eq("id",teacherId).maybeSingle();
 if(error)throw new TeacherProfileError(500,"DATABASE_ERROR","Profile unavailable");
 if(!data)throw new TeacherProfileError(404,"NOT_FOUND","Profile not found");
 return {id:data.id,displayName:data.display_name,avatarUrl:data.avatar_url};
}
export async function teacherProfileUpdate(
 db:SupabaseClient,teacherId:string,changes:{
 displayName?:unknown;avatarUrl?:unknown;
}){
 // This domain operation is shared by the website and MCP. Authentication
 // credentials, sign-in email, and MFA settings require a secure browser
 // identity flow; reject rather than silently ignoring such extra inputs.
 if(Object.keys(changes).some(key=>key!=="displayName"&&key!=="avatarUrl"))
   throw new TeacherProfileError(400,"VALIDATION_ERROR","Unsupported profile field");
 const patch:{display_name?:string;avatar_url?:string|null}={};
 if(changes.displayName!==undefined){
   if(typeof changes.displayName!=="string"||!changes.displayName.trim())
     throw new TeacherProfileError(400,"VALIDATION_ERROR","Display name is required");
   if(changes.displayName.trim().length>200)
     throw new TeacherProfileError(400,"VALIDATION_ERROR","Display name is too long");
   patch.display_name=changes.displayName.trim();
 }
 if(changes.avatarUrl!==undefined){
   if(changes.avatarUrl!==null&&typeof changes.avatarUrl!=="string")
     throw new TeacherProfileError(400,"VALIDATION_ERROR","Invalid avatar URL");
   if(typeof changes.avatarUrl==="string"){
     const prefix=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${teacherId}/`;
     if(changes.avatarUrl.length>2048||!changes.avatarUrl.startsWith(prefix))
       throw new TeacherProfileError(400,"VALIDATION_ERROR","Invalid avatar URL");
   }
   patch.avatar_url=changes.avatarUrl as string|null;
 }
 if(Object.keys(patch).length===0)
   throw new TeacherProfileError(400,"VALIDATION_ERROR","Nothing to update");
 const {data,error}=await db.from("teachers").update(patch)
  .eq("id",teacherId).select("id").maybeSingle();
 if(error)throw new TeacherProfileError(500,"DATABASE_ERROR","Failed to update profile");
 if(!data)throw new TeacherProfileError(404,"NOT_FOUND","Profile not found");
 return {ok:true};
}
