import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { SEED_TEACHER } from "./helpers/auth";
import { delegatedTool } from "./helpers/delegated-mcp";

async function portalFixture(page:import("@playwright/test").Page,
  call:Awaited<ReturnType<typeof delegatedTool>>) {
  const student = await call("ccp_v1_students_create", {
    name:"Portal cancellation student "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const guardian=await call("ccp_v1_guardians_create",{
    name:"Portal guardian "+randomUUID(),studentIds:[studentId],confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  const details=await page.request.get("/api/guardians/"+guardian.data.id);
  expect(details.status(),await details.text()).toBe(200);
  const token=(await details.json()).portal_token as string;
  expect(token).toBeTruthy();
  const lesson=await call("ccp_v1_calendar_lessons_create",{
    studentId,date:"2058-06-25",time:"14:00",durationMinutes:50,confirmed:true,
  });
  expect(lesson.error).toBeUndefined();
  const lessonId=lesson.data.id as string;
  const url="/api/portal/"+encodeURIComponent(token)+"/lessons/"+lessonId+"/cancel";
  return {studentId,token,lessonId,url};
}

test("PARITY:PARITY-portal-cancel-atomic-replay preserves one notice timestamp and MCP readback",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const ctx=await portalFixture(page,call);
  const original={note:"Out of town for a chess event"};
  const [first,second]=await Promise.all([
    page.request.post(ctx.url,{data:original}),
    page.request.post(ctx.url,{data:original}),
  ]);
  expect(first.status(),await first.text()).toBe(200);
  expect(second.status(),await second.text()).toBe(200);
  const a=await first.json(),b=await second.json();
  expect([a.replayed,b.replayed].sort()).toEqual([false,true]);
  expect(a.noticeAt).toBe(b.noticeAt);
  expect(a.noticeAt).toBeTruthy();
  const read=await call("ccp_v1_calendar_attendance_read",{lessonId:ctx.lessonId});
  expect(read.error).toBeUndefined();
  expect(read.data.status).toBe("student_cancel");
  expect(read.data.notice_at).toBe(a.noticeAt);
  expect(read.data.cancel_note).toBe(original.note);
  const later=await page.request.post(ctx.url,{data:{note:"Cannot silently change the note"}});
  expect(later.status()).toBe(200);
  expect((await later.json()).replayed).toBe(true);
  const after=await call("ccp_v1_calendar_attendance_read",{lessonId:ctx.lessonId});
  expect(after.data).toEqual(read.data);

  const otherGuardian=await call("ccp_v1_guardians_create",{
    name:"Unrelated guardian "+randomUUID(),confirmed:true,
  });
  expect(otherGuardian.error).toBeUndefined();
  const foreign=await page.request.get("/api/guardians/"+otherGuardian.data.id);
  expect(foreign.status()).toBe(200);
  const foreignToken=(await foreign.json()).portal_token as string;
  const denied=await page.request.post(
    "/api/portal/"+encodeURIComponent(foreignToken)+"/lessons/"+ctx.lessonId+"/cancel",
    {data:original});
  expect(denied.status()).toBe(404);

  // No authenticated PostgREST writer may bypass the common SQL attendance
  // revision/receipt contract, even when it owns the lesson.
  const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
  const login=await direct.auth.signInWithPassword(SEED_TEACHER);
  expect(login.error).toBeNull();
  const raw=await direct.from("attendance")
    .update({status:"attended"}).eq("lesson_id",ctx.lessonId);
  expect(raw.error).not.toBeNull();
  const preserved=await call("ccp_v1_calendar_attendance_read",{lessonId:ctx.lessonId});
  expect(preserved.data.status).toBe("student_cancel");
});

test("PARITY:PARITY-portal-cancel-respects-teacher-attendance-and-future-time",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const ctx=await portalFixture(page,call);
  const teacher=await page.request.put(
    "/api/schedule/lessons/"+ctx.lessonId+"/attendance",{
      data:{status:"attended",expectedMarkedAt:null,
        idempotencyKey:randomUUID(),notifyFamily:false},
    });
  expect(teacher.status(),await teacher.text()).toBe(200);
  const denied=await page.request.post(ctx.url,{data:{note:"Too late to cancel"}});
  expect(denied.status()).toBe(409);
  const still=await call("ccp_v1_calendar_attendance_read",{lessonId:ctx.lessonId});
  expect(still.data.status).toBe("attended");
  const invalid=await page.request.post(ctx.url,{data:{note:"x".repeat(1001)}});
  expect(invalid.status()).toBe(400);
});
