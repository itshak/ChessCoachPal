import {createHash,randomBytes,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {resolvePortalContext} from "../lib/server/portal-scope-service";
import {getPolicy} from "../lib/server/scheduling";

test("scoped guest cancellation metadata uses only its teacher's typed policy and canonical fallback",async()=>{
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const teacherIds:string[]=[];
 const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
 const insert=async(table:string,row:Record<string,unknown>)=>{
  const result=await db.from(table).insert(row).select("id").single();
  expect(result.error,table).toBeNull();
  return result.data!.id as string;
 };
 const fixture=async(hours:number,locale:string)=>{
  const email="synthetic-guest-policy-"+randomUUID()+"@example.invalid";
  const identity=await db.auth.admin.createUser({email,password:"SyntheticGuestPolicy-123!",email_confirm:true});
  expect(identity.error).toBeNull();
  const teacher_id=identity.data.user!.id;
  teacherIds.push(teacher_id);
  expect((await db.from("teachers").insert({id:teacher_id,email,display_name:"Synthetic guest policy"})).error).toBeNull();
  expect((await db.from("teacher_settings").upsert({teacher_id,cancellation_window_hours:hours},{
   onConflict:"teacher_id",
  })).error).toBeNull();
  const workplace_id=await insert("workplaces",{teacher_id,name:"Synthetic guest workplace",
   kind:"professional",timezone:"Asia/Jerusalem",currency:"ILS",locale,policy:{cancellationWindowHours:7},
  });
  const student_id=await insert("students",{teacher_id,name:"Synthetic guest student"});
  const contact_id=await insert("contacts",{teacher_id,display_name:"Synthetic recipient",preferred_locale:locale});
  await insert("student_contacts",{teacher_id,student_id,contact_id,relationship_label:"Recipient"});
  await insert("workplace_enrollments",{teacher_id,student_id,workplace_id,source:"manual",starts_on:"2020-01-01"});
  const token=randomBytes(32).toString("base64url");
  await insert("portal_access_grants",{teacher_id,workplace_id,student_id,contact_id,permissions:["cancel"],
   token_digest:digest(token),issued_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),
  });
  return {teacher_id,workplace_id,student_id,contact_id,token};
 };
 try{
  const own=await fixture(480,"he"),foreign=await fixture(0,"ru");
  for(const [account,hours,locale] of [[own,480,"he"],[foreign,0,"ru"]] as const){
   const ctx=await resolvePortalContext(db,account.token);
   expect(ctx?.grant.teacherId).toBe(account.teacher_id);
   expect(ctx?.student.id).toBe(account.student_id);
   expect(ctx?.contact).toMatchObject({id:account.contact_id,preferredLocale:locale});
   expect(ctx?.workplace).toMatchObject({
    id:account.workplace_id,timezone:"Asia/Jerusalem",currency:"ILS",locale,cancellationWindowHours:hours,
   });
   expect((await getPolicy(db,account.teacher_id)).cancellation_window_hours).toBe(hours);
   expect(ctx?.grant.permissions.has("cancel")).toBe(true);
   expect(ctx?.grant.permissions.has("calendar")).toBe(false);
   expect(ctx?.workplace).not.toHaveProperty("policy");
  }
  expect(await resolvePortalContext(db,randomBytes(32).toString("base64url"))).toBeNull();
  expect((await db.from("teacher_settings").delete().eq("teacher_id",own.teacher_id)).error).toBeNull();
  expect((await resolvePortalContext(db,own.token))?.workplace.cancellationWindowHours).toBe(24);
  expect((await getPolicy(db,own.teacher_id)).cancellation_window_hours).toBe(24);
  expect((await resolvePortalContext(db,foreign.token))?.workplace.cancellationWindowHours).toBe(0);
 }finally{
  for(const id of teacherIds.reverse())expect((await db.auth.admin.deleteUser(id)).error).toBeNull();
 }
});
