import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";
import {addDays,formatLessonDate,startOfWeek,toLocalDateString,zonedTimeToUtc} from "../lib/schedule";

test("PARITY: calendar venue context sets local defaults, preserves snapshot dates and shares confirmed creation with MCP",async({page,request})=>{
 test.setTimeout(90000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="calendar-context-"+randomUUID()+"@example.com",password="SyntheticCalendarContext-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id,teacherTimezone="Etc/GMT+12",venueTimezone="Pacific/Kiritimati";
 try{
  expect((await admin.from("teachers").insert({id:teacherId,email,display_name:"Synthetic local calendar coach",
   onboarding_tour_completed_at:new Date().toISOString()})).error).toBeNull();
  expect((await admin.from("teacher_settings").upsert({teacher_id:teacherId,timezone:teacherTimezone,
   teacher_cancel_earns_makeup:true})).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,5,2);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const venue=await call("ccp_workplaces_create",{name:"Synthetic Date Line School "+randomUUID(),timezone:venueTimezone,
   currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID()});
  expect(venue.error).toBeUndefined();
  const workplaceId=venue.data.entityId as string;
  const learnerName="Synthetic venue learner "+randomUUID();
  const learner=await call("ccp_students_create",{name:learnerName,idempotencyKey:randomUUID()});
  expect(learner.error).toBeUndefined();
  const studentId=learner.data.entityId as string;
  expect((await admin.from("workplace_enrollments").insert({
   teacher_id:teacherId,workplace_id:workplaceId,student_id:studentId,starts_on:"2020-01-01",source:"manual",
  })).error).toBeNull();
  const now=new Date(),venueToday=toLocalDateString(now,venueTimezone),personalToday=toLocalDateString(now,teacherTimezone);
  expect(venueToday).not.toBe(personalToday);

  const legacyInstant="2063-01-10T21:15:00Z",missedInstant="2022-02-03T23:30:00Z";
  const snapshotId=randomUUID(),missedId=randomUUID();
  expect((await admin.from("teaching_sessions").insert([
   {id:snapshotId,starts_at:legacyInstant},{id:missedId,starts_at:missedInstant},
  ].map(row=>({...row,teacher_id:teacherId,student_id:studentId,workplace_id:workplaceId,
   local_timezone:"UTC",title:"Synthetic frozen lesson",duration_minutes:45})))).error).toBeNull();
  const eventName="Synthetic selected event "+randomUUID();
  expect((await admin.from("events").insert({teacher_id:teacherId,workplace_id:workplaceId,
   starts_at:legacyInstant,title:eventName})).error).toBeNull();
  const attendance=await call("ccp_session_attendance_set",{sessionId:missedId,studentId,
   status:"teacher_cancelled",noticeAt:null,cancelReason:"Synthetic teacher cancellation",expectedUpdatedAt:null,
   confirmed:true,idempotencyKey:randomUUID()});
  expect(attendance.error).toBeUndefined();
  const credits=await call("ccp_canonical_makeup_credits_list",{});
  expect(credits.error).toBeUndefined();
  expect(credits.data.credits).toEqual([expect.objectContaining({sourceSessionId:missedId,sourceTimezone:"UTC"})]);
  const creditHTTP=await page.request.get("/api/coaching/calendar/makeup-credits");
  expect(creditHTTP.status(),await creditHTTP.text()).toBe(200);
  expect(await creditHTTP.json()).toEqual(credits.data);

  await page.goto("/schedule");
  const calendarToday=page.locator('[data-calendar-date="'+personalToday+'"]');
  await expect(calendarToday).toHaveClass(/bg-primary/);
  await page.getByRole("button",{name:"Private session"}).click();
  const heading=page.getByRole("heading",{name:"Schedule an individual chess lesson"});
  await expect(heading).toBeVisible();
  const draft=heading.locator("..");
  const fields={
   venue:draft.locator("select").nth(1),
   date:draft.locator('input[type="date"]'),
   time:draft.locator('input[type="time"]'),
   student:draft.locator("select").first(),
  };
  await expect(fields.venue).toHaveValue("");
  await expect(fields.date).toHaveValue(personalToday);
  await fields.venue.selectOption(workplaceId);
  await expect(fields.date).toHaveValue(venueToday);
  const custom=addDays(venueToday,7);
  await fields.date.fill(custom);
  await fields.venue.selectOption("");
  await expect(fields.date).toHaveValue(custom);
  await page.getByRole("button",{name:"Private session"}).click();

  expect((await call("ccp_workplace_context_set",{selectedWorkplaceId:workplaceId,expectedSelectedWorkplaceId:null,confirmed:true})).error)
   .toBeUndefined();
  await page.goto("/schedule?week=2063-01-10");
  await expect(page.locator('[data-calendar-date="2063-01-11"]').getByRole("link",{name:new RegExp(eventName)})).toBeVisible();
  await expect(page.locator('[data-calendar-date="2063-01-10"]').getByText(learnerName,{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Today",exact:true}).and(page.locator('a[href="/schedule"]')).click();
  await expect(page.locator('[data-calendar-date="'+venueToday+'"]')).toHaveClass(/bg-primary/);
  await expect(page.getByText(startOfWeek(venueToday)+" – "+addDays(startOfWeek(venueToday),6),{exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Teacher settings"})).toBeVisible();

  await page.getByRole("button",{name:"Add weekly slot"}).click();
  await expect(page.getByLabel("Starts on",{exact:true})).toHaveValue(venueToday);
  await expect(page.locator("label").filter({hasText:"Weekday"}).locator("select")).toHaveValue(String(new Date(venueToday+"T12:00:00Z").getUTCDay()));
  // Close the recurring draft before opening a private draft; neither is saved.
  await page.goto("/schedule");
  await expect(page.getByText(formatLessonDate(missedInstant,"UTC","short"),{exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Book make-up"}).click();
  const makeup=page.getByRole("heading",{name:/Make-up lesson for/}).locator("..");
  await expect(makeup.locator("select")).toHaveValue(workplaceId);
  await expect(makeup.locator('input[type="date"]')).toHaveValue(venueToday);
  await makeup.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("button",{name:"Private session"}).click();
  await expect(fields.venue).toHaveValue(workplaceId);
  await expect(fields.date).toHaveValue(venueToday);
  const before=await admin.from("teaching_sessions").select("id",{count:"exact",head:true}).eq("teacher_id",teacherId);
  expect(before.error).toBeNull();expect(before.count).toBe(2);

  const date=addDays(venueToday,1),time="10:15";
  await fields.student.selectOption(studentId);
  await fields.date.fill(date);await fields.time.fill(time);
  const awaited=page.waitForResponse(r=>r.url().endsWith("/api/coaching/calendar/private-sessions")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Create session",exact:true}).click();
  const result=await awaited;
  expect(result.ok(),await result.text()).toBe(true);
  const requestBody=result.request().postDataJSON();
  expect(requestBody).toMatchObject({studentId,workplaceId,date,time});
  const website=await result.json();
  const replay=await call("ccp_private_sessions_create",{...requestBody,confirmed:true});
  expect(replay.error).toBeUndefined();
  expect(replay.data).toMatchObject({id:website.id,replayed:true,workplace_id:workplaceId});
  expect(new Date(replay.data.starts_at).toISOString()).toBe(zonedTimeToUtc(date,time,venueTimezone).toISOString());
  const after=await admin.from("teaching_sessions").select("id,local_timezone").eq("teacher_id",teacherId);
  expect(after.error).toBeNull();expect(after.data).toHaveLength(3);
  expect(after.data?.find(row=>row.id===snapshotId)?.local_timezone).toBe("UTC");
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
