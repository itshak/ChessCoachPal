import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {SEED_TEACHER} from "./helpers/auth";

test("PARITY:PARITY-unified-lessons-reconcile flags twins without double-counting instructor time",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const day="2042-06-12",startsAt=day+"T14:00:00.000Z";
 const workplace=await call("ccp_v1_workplaces_create",{
   name:"Unified history "+randomUUID(),timezone:"UTC",
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const wp=workplace.data.entityId as string;
 const student=await call("ccp_v1_students_create",{
   name:"Historic learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const id=student.data.entityId as string;
 expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId:wp,studentId:id,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const modern=await call("ccp_v1_sessions_create",{
   workplaceId:wp,studentId:id,title:"Duplicate lesson evidence",
   startsAt,durationMinutes:60,lessonNote:"Modern record",
   idempotencyKey:randomUUID(),
 });
 expect(modern.error).toBeUndefined();
 const sessionId=modern.data.entityId as string;
 const attended=await page.request.post("/api/agent/v1",{data:{
   action:"attendance.record",sessionId,studentId:id,status:"present",
   note:"Recorded actual lesson",
 }});
 expect(attended.status(),await attended.text()).toBe(200);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const auth=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
   auth:{persistSession:false,autoRefreshToken:false},
 });
 const signed=await auth.auth.signInWithPassword(SEED_TEACHER);
 expect(signed.error).toBeNull();
 const legacy=await admin.from("lessons").insert({
   teacher_id:signed.data.user!.id,student_id:id,
   slot_id:null,lesson_date:day,starts_at:startsAt,duration_minutes:60,
 }).select("id").single();
 expect(legacy.error).toBeNull();
 expect((await admin.from("attendance").insert({
   lesson_id:legacy.data!.id,status:"attended",marked_at:new Date().toISOString(),
 })).error).toBeNull();
 const query={from:day,to:day,studentId:id};
 const browser=await page.request.get("/api/coaching/unified-lessons?"+new URLSearchParams(query));
 expect(browser.status(),await browser.text()).toBe(200);
 const site=await browser.json();
 const tool=await call("ccp_v1_lessons_history_unified",query);
 expect(tool.error).toBeUndefined();
 expect(tool.data).toEqual(site);
 expect(site.total).toBe(2);
 expect(site.summary.possibleCrossModelDuplicates).toBe(1);
 expect(site.summary.coachingSessionCount).toBe(1);
 expect(site.summary.unattributedLegacyLessonCount).toBe(1);
 expect(site.summary.bookedInstructorMinutes).toBe(60);
 expect(site.summary.evidencedInstructorMinutes).toBe(60);
 expect(site.entries.some((entry:{kind:string;possibleDuplicateOf?:string})=>
   entry.kind==="legacy"&&entry.possibleDuplicateOf==="coaching:"+sessionId)).toBe(true);
 const focused=await call("ccp_v1_lessons_history_unified",{
   from:day,to:day,workplaceId:wp,
 });
 expect(focused.error).toBeUndefined();
 expect(focused.data.summary.coachingSessionCount).toBe(1);
 expect(focused.data.summary.unattributedLegacyLessonCount).toBe(0);
 const missingId="00000000-0000-4000-8000-000000000001";
 const rejected=await call("ccp_v1_lessons_history_unified",{
   from:day,to:day,studentId:missingId,
 });
 expect(rejected.error?.code).toBe("NOT_FOUND");
 const websiteDenied=await page.request.get("/api/coaching/unified-lessons?"+
   new URLSearchParams({from:day,to:day,studentId:missingId}));
 expect(websiteDenied.status()).toBe(404);
});
