import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { SEED_TEACHER, signInAsTeacher } from "./helpers/auth";

test("delegated OAuth PKCE -> real MCP calls -> idempotent attendance/topic -> immediate revocation", async ({page, request}) => {
  const origin = "http://localhost:3000";
  // Local loopback callback avoids depending on a fake external DNS name in CI.
  const callback = "http://localhost:3000/oauth/synthetic-callback";
  const verifier = "s".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const resource = origin + "/mcp";

  const forbidden = await request.post("/mcp", { data: {jsonrpc:"2.0",id:1,method:"tools/list"} });
  expect(forbidden.status()).toBe(401);
  expect(forbidden.headers()["www-authenticate"]).toContain("oauth-protected-resource");

  const reg = await request.post("/oauth/register", {data:{
    client_name:"Synthetic MCP client",redirect_uris:[callback],
    token_endpoint_auth_method:"none",
  }});
  expect(reg.status(), await reg.text()).toBe(201);
  const clientId = (await reg.json()).client_id as string;

  await signInAsTeacher(page);
  const params = new URLSearchParams({
    client_id:clientId,redirect_uri:callback,response_type:"code",
    resource,code_challenge_method:"S256",code_challenge:challenge,
    state:"synthetic-state-1234",scope:"coach:read coach:write",
  });
  await page.goto("/oauth/authorize?"+params.toString());
  await expect(page.getByRole("heading",{name:"Authorize AI connector"})).toBeVisible();
  await expect(page.getByText("coach:read coach:write", {exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Authorize"}).click();
  await page.waitForURL(url => url.pathname === "/oauth/synthetic-callback" &&
    url.searchParams.has("code"), {waitUntil:"commit",timeout:20000});
  const code = new URL(page.url()).searchParams.get("code");
  expect(code).toBeTruthy();

  const tokenResp = await request.post("/oauth/token",{form:{
    grant_type:"authorization_code",client_id:clientId,
    redirect_uri:callback,code:code!,code_verifier:verifier,resource,
  }});
  expect(tokenResp.status(),await tokenResp.text()).toBe(200);
  const token = await tokenResp.json();
  expect(token.expires_in).toBe(600);

  const exchangeAgain = await request.post("/oauth/token",{form:{
    grant_type:"authorization_code",client_id:clientId,
    redirect_uri:callback,code:code!,code_verifier:verifier,resource,
  }});
  expect(exchangeAgain.status()).toBe(400);

  const mcp = async (method:string, params?:unknown) => {
    const response=await request.post("/mcp",{headers:{
      Authorization:"Bearer "+token.access_token,
      "MCP-Protocol-Version":"2025-06-18",
    },data:{jsonrpc:"2.0",id:randomUUID(),method,params}});
    expect(response.status(),await response.text()).toBe(200);
    return (await response.json()).result;
  };
  expect((await mcp("initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"synthetic",version:"1"}})).serverInfo.name)
    .toBe("ChessCoachPal");
  const names = (await mcp("tools/list")).tools.map((tool:{name:string})=>tool.name);
  expect(names).toContain("ccp_v1_attendance_record");

  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
  });
  const {data:{session},error} = await userClient.auth.signInWithPassword(SEED_TEACHER);
  expect(error).toBeNull();
  expect(session).not.toBeNull();
  const postDomain = async (payload:Record<string,unknown>) => {
    const r=await request.post("/api/agent/v1",{data:payload,headers:{
      Authorization:"Bearer "+session!.access_token,
    }});
    expect(r.status(),await r.text()).toBeLessThan(300);
    return (await r.json()).data;
  };
  const suffix=Date.now().toString(36);
  // Dashboard and notifications share the exact same tenant-scoped service.
  expect(names).toContain("ccp_v1_dashboard_summary");
  const dashboard = (await mcp("tools/call", {
    name: "ccp_v1_dashboard_summary", arguments: {},
  })).structuredContent.data;
  const websiteDashboard = await page.request.get("/api/dashboard/summary");
  expect(websiteDashboard.status()).toBe(200);
  expect(dashboard).toEqual(await websiteDashboard.json());
  expect(dashboard.studentCount).toBeGreaterThan(0);

  for (const toolName of ["ccp_v1_notifications_list", "ccp_v1_notifications_mark_read"])
    expect(names).toContain(toolName);
  const notificationsBefore = (await mcp("tools/call", {
    name: "ccp_v1_notifications_list", arguments: {},
  })).structuredContent.data;
  const websiteNotifications = await page.request.get("/api/notifications");
  expect(websiteNotifications.status()).toBe(200);
  expect(notificationsBefore).toEqual(await websiteNotifications.json());

  // Seed a real notification via synthetic CI admin, never by delegated MCP.
  const notificationAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: seededNotification, error: notificationSeedError } = await notificationAdmin
    .from("notifications").insert({
      teacher_id: session!.user.id, type: "event_rsvp",
      title: "MCP synthetic " + suffix, body: "Synthetic parity check",
    }).select("id").single();
  expect(notificationSeedError).toBeNull();
  expect(seededNotification?.id).toBeTruthy();
  const marked = (await mcp("tools/call", {
    name: "ccp_v1_notifications_mark_read", arguments: { id: seededNotification!.id },
  })).structuredContent;
  expect(marked.data.ok).toBe(true);
  const websiteAfter = await page.request.get("/api/notifications");
  expect(websiteAfter.status()).toBe(200);
  expect((await websiteAfter.json()).notifications.find((n:{id:string}) =>
    n.id === seededNotification!.id).read_at).toBeTruthy();
  const markAll = (await mcp("tools/call", {
    name: "ccp_v1_notifications_mark_read", arguments: { all: true },
  })).structuredContent;
  expect(markAll.data.ok).toBe(true);
  const afterAll = (await mcp("tools/call", {
    name: "ccp_v1_notifications_list", arguments: {},
  })).structuredContent.data;
  const webAfterAll = await page.request.get("/api/notifications");
  expect(afterAll).toEqual(await webAfterAll.json());

  const workplace=await postDomain({action:"workplaces.create",name:"Agent test "+suffix,timezone:"UTC"});
  const student=await postDomain({action:"students.create",name:"Agent synthetic learner "+suffix});
  const group=await postDomain({action:"groups.create",workplaceId:workplace.id,name:"Class "+suffix});
  await postDomain({action:"groups.enroll",groupId:group.id,studentId:student.id});
  const sessionRecord=await postDomain({action:"sessions.create",requestId:randomUUID(),
    workplaceId:workplace.id,groupId:group.id,title:"Agent lesson "+suffix,
    startsAt:"2027-04-12T14:00:00.000Z",durationMinutes:60,lessonNote:"Original"});
  // The website and the delegated MCP grant must return identical scoped report data.
  const reportArgs = { workplaceId: workplace.id, from: "2027-04-12", to: "2027-04-12" };
  expect(names).toContain("ccp_v1_reports_workplace_summary");
  const reportCall = (await mcp("tools/call", {
    name: "ccp_v1_reports_workplace_summary", arguments: reportArgs,
  })).structuredContent;
  expect(reportCall.error).toBeUndefined();
  const websiteReport = await page.request.get("/api/coaching/report?" + new URLSearchParams(reportArgs));
  expect(websiteReport.status(), await websiteReport.text()).toBe(200);
  expect(reportCall.data).toEqual(await websiteReport.json());
  expect(reportCall.data.report.teachingMinutes).toBe(60);
  const csvReport = (await mcp("tools/call", {
    name: "ccp_v1_reports_workplace_summary", arguments: { ...reportArgs, format: "csv" },
  })).structuredContent;
  expect(csvReport.data.report).toEqual(reportCall.data.report);
  expect(csvReport.data.export).toContain("Teaching minutes");
  const textReport = (await mcp("tools/call", {
    name: "ccp_v1_reports_workplace_summary", arguments: { ...reportArgs, format: "text" },
  })).structuredContent;
  expect(textReport.data.export).toContain("Teaching minutes: 60");
  const invalidReport = (await mcp("tools/call", {
    name: "ccp_v1_reports_workplace_summary", arguments: { ...reportArgs, from: "2027-04-13" },
  })).structuredContent;
  expect(invalidReport.error.code).toBe("VALIDATION_ERROR");

  // Chess learning tool contract: agents can propose and link, but cannot approve.
  for (const name of ["ccp_v1_chess_categories_list","ccp_v1_chess_observations_propose",
    "ccp_v1_chess_resources_link","ccp_v1_chess_observations_list","ccp_v1_chess_resources_list"]) {
    expect(names).toContain(name);
  }
  expect(names).not.toContain("ccp_v1_chess_observations_approve");
  const catResult=(await mcp("tools/call",{
    name:"ccp_v1_chess_categories_list",arguments:{},
  })).structuredContent;
  const endgames=catResult.data.find((c:{name:string})=>c.name==="Endgames");
  expect(endgames).toBeTruthy();
  const proposed=(await mcp("tools/call",{
    name:"ccp_v1_chess_observations_propose",arguments:{
      studentId:student.id,sessionId:sessionRecord.id,categoryId:endgames.id,
      observation:"Needs pawn-endgame opposition practice",requestId:randomUUID(),
    },
  })).structuredContent;
  expect(proposed.data.source).toBe("agent");
  expect(proposed.data.verified_at).toBeNull();
  const linked=(await mcp("tools/call",{
    name:"ccp_v1_chess_resources_link",arguments:{
      studentId:student.id,sessionId:sessionRecord.id,
      label:"Synthetic Lichess opposition study",
      url:"https://lichess.org/study/Ab12Cd34",resourceType:"lichess_study",
      requestId:randomUUID(),
    },
  })).structuredContent;
  expect(linked.data.provider_study_id).toBe("Ab12Cd34");
  const observations=(await mcp("tools/call",{
    name:"ccp_v1_chess_observations_list",arguments:{studentId:student.id},
  })).structuredContent.data;
  expect(observations.some((v:{id:string})=>v.id===proposed.data.id)).toBe(true);
  const resources=(await mcp("tools/call",{
    name:"ccp_v1_chess_resources_list",arguments:{studentId:student.id},
  })).structuredContent.data;
  expect(resources.some((v:{id:string})=>v.id===linked.data.id)).toBe(true);
  const missingApproval=(await mcp("tools/call",{
    name:"ccp_v1_chess_observations_approve",arguments:{observationId:proposed.data.id},
  })).structuredContent;
  expect(missingApproval.error.code).toBe("NOT_FOUND");
  const websiteObservation=(await postDomain({action:"chess.observations.list",studentId:student.id}))
    .find((v:{id:string})=>v.id===proposed.data.id);
  expect(websiteObservation.verified_at).toBeNull();

  // The delegated MCP bearer MUST NOT expose a second teacher's records.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}});
  const otherEmail = "mcp-isolation-" + suffix + "@example.com";
  const {data:otherUser,error:otherError} = await admin.auth.admin.createUser({
    email:otherEmail,password:"SyntheticPassword-123!",email_confirm:true,
  });
  expect(otherError).toBeNull();
  expect(otherUser.user).toBeTruthy();
  const otherId = otherUser.user!.id;
  const {error:otherTeacherError} = await admin.from("teachers").insert({
    id:otherId,email:otherEmail,display_name:"Synthetic MCP Teacher B",
  });
  expect(otherTeacherError).toBeNull();
  const {data:foreignWorkplace,error:foreignWorkplaceError}=await admin.from("workplaces")
    .select("id").eq("teacher_id",otherId).single();
  expect(foreignWorkplaceError).toBeNull();
  const foreignReport = (await mcp("tools/call", {
    name: "ccp_v1_reports_workplace_summary",
    arguments: { workplaceId: foreignWorkplace!.id, from: "2027-04-12", to: "2027-04-13" },
  })).structuredContent;
  expect(foreignReport.error.code).toBe("NOT_FOUND");
  const {data:foreignStudent,error:foreignStudentError}=await admin.from("students")
    .insert({teacher_id:otherId,name:"Private student "+suffix}).select("id").single();
  expect(foreignStudentError).toBeNull();
  const {error:foreignEnrollError}=await admin.from("workplace_enrollments").insert({
    teacher_id:otherId,workplace_id:foreignWorkplace!.id,student_id:foreignStudent!.id,
  });
  expect(foreignEnrollError).toBeNull();
  const {data:foreignSession,error:foreignSessionError}=await admin.from("teaching_sessions")
    .insert({teacher_id:otherId,workplace_id:foreignWorkplace!.id,
      student_id:foreignStudent!.id,title:"Private session "+suffix,
      starts_at:"2027-04-13T14:00:00.000Z",duration_minutes:60,
      lesson_note:"Other teacher private note",
    }).select("id").single();
  expect(foreignSessionError).toBeNull();
  const outside=(await mcp("tools/call",{
    name:"ccp_v1_sessions_participants",arguments:{sessionId:foreignSession!.id},
  }));
  expect(outside.isError).toBe(true);
  expect(outside.structuredContent.error.code).toBe("NOT_FOUND");
  const scopedSessions=(await mcp("tools/call",{
    name:"ccp_v1_sessions_list",arguments:{query:"Private session "+suffix},
  })).structuredContent.data;
  expect(scopedSessions).toEqual([]);

  // A name is not a stable ID: ambiguous matches return candidates, not a guessed write.
  const duplicateName = "Synthetic duplicate " + suffix;
  const duplicateA = await postDomain({action:"students.create",name:duplicateName});
  const duplicateB = await postDomain({action:"students.create",name:duplicateName});
  const ambiguous=(await mcp("tools/call",{
    name:"ccp_v1_students_search",arguments:{query:duplicateName},
  }));
  expect(ambiguous.isError).toBe(true);
  expect(ambiguous.structuredContent.error.code).toBe("NEEDS_RESOLUTION");
  expect(ambiguous.structuredContent.error.candidates.map((x:{id:string})=>x.id).sort())
    .toEqual([duplicateA.id,duplicateB.id].sort());

  const list = (await mcp("tools/call",{
    name:"ccp_v1_sessions_list",arguments:{query:"Agent lesson "+suffix},
  })).structuredContent.data;
  const current = list.find((s:{id:string})=>s.id===sessionRecord.id);
  expect(current.revision).toBeTruthy();

  const preview = (await mcp("tools/call",{
    name:"ccp_v1_attendance_preview",arguments:{sessionId:sessionRecord.id},
  })).structuredContent.data;
  expect(preview.participants).toHaveLength(1);
  expect(preview.attendance).toHaveLength(1);
  const attendanceArgs = {
    sessionId:sessionRecord.id,studentId:student.id,status:"present",
    note:"",expectedUpdatedAt:preview.attendance[0].updated_at,
    idempotencyKey:randomUUID(),
  };
  const first=(await mcp("tools/call",{name:"ccp_v1_attendance_record",arguments:attendanceArgs})).structuredContent;
  expect(first.data.status).toBe("present");
  const retry=(await mcp("tools/call",{name:"ccp_v1_attendance_record",arguments:attendanceArgs})).structuredContent;
  expect(retry).toEqual(first);

  const conflict=(await mcp("tools/call",{name:"ccp_v1_attendance_record",arguments:{
    ...attendanceArgs,idempotencyKey:randomUUID(),status:"absent",
  }}));
  expect(conflict.isError).toBe(true);
  expect(conflict.structuredContent.error.code).toBe("CONFLICT");

  const update=(await mcp("tools/call",{name:"ccp_v1_sessions_note_update",arguments:{
    sessionId:sessionRecord.id,lessonNote:"Practiced opposition",
    expectedUpdatedAt:current.revision,idempotencyKey:randomUUID(),
  }})).structuredContent;
  expect(update.data.operation).toBe("sessions.note.update");

  const fromWebsite = (await postDomain({action:"sessions.list"}))
    .find((s:{id:string})=>s.id===sessionRecord.id);
  expect(fromWebsite.lesson_note).toBe("Practiced opposition");
  const afterAttendance = (await postDomain({action:"attendance.list",sessionId:sessionRecord.id}));
  expect(afterAttendance[0].status).toBe("present");


  // The 2b tool surface is exercised over real delegated OAuth/MCP, with a
  // synthetic database and website-domain readback; no vendor accounts involved.
  const call = async (name:string, args:Record<string,unknown>) =>
    (await mcp("tools/call",{name,arguments:args}));
  for (const name of [
    "ccp_v1_workplaces_create","ccp_v1_workplaces_update","ccp_v1_workplaces_enroll",
    "ccp_v1_students_create","ccp_v1_students_update",
    "ccp_v1_groups_create","ccp_v1_groups_update","ccp_v1_groups_enroll",
    "ccp_v1_groups_unenroll","ccp_v1_sessions_create","ccp_v1_sessions_reschedule",
    "ccp_v1_sessions_cancel","ccp_v1_sessions_details",
  ]) expect(names).toContain(name);

  const workplaceArgs={name:"MCP workplace "+suffix,timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID()};
  const madeWorkplace=(await call("ccp_v1_workplaces_create",workplaceArgs)).structuredContent.data;
  expect(madeWorkplace.actorId).toBe(session!.user.id);
  expect(madeWorkplace.clientId).toBe(clientId);
  expect(madeWorkplace.revision).toBeTruthy();
  expect((await call("ccp_v1_workplaces_create",workplaceArgs)).structuredContent.data)
    .toEqual(madeWorkplace);
  const differentPayloadReplay=await call("ccp_v1_workplaces_create",{
    ...workplaceArgs,name:"Not another workplace", 
  });
  expect(differentPayloadReplay.isError).toBe(true);
  expect(differentPayloadReplay.structuredContent.error.code).toBe("CONFLICT");
  expect(JSON.stringify(madeWorkplace)).not.toContain(workplaceArgs.name);
  expect((await postDomain({action:"workplaces.list"}))
    .some((x:{id:string})=>x.id===madeWorkplace.entityId)).toBe(true);
  const workplaceUpdateArgs={workplaceId:madeWorkplace.entityId,
    name:"Renamed MCP workplace "+suffix,expectedUpdatedAt:madeWorkplace.revision,
    idempotencyKey:randomUUID()};
  const revisedWorkplace=(await call("ccp_v1_workplaces_update",workplaceUpdateArgs))
    .structuredContent.data;
  expect(revisedWorkplace.revision).not.toBe(madeWorkplace.revision);
  const staleWorkplace=await call("ccp_v1_workplaces_update",{
    ...workplaceUpdateArgs,name:"Should not overwrite",idempotencyKey:randomUUID(),
  });
  expect(staleWorkplace.isError).toBe(true);
  expect(staleWorkplace.structuredContent.error.code).toBe("CONFLICT");

  const madeStudent=(await call("ccp_v1_students_create",{
    name:"MCP learner "+suffix,level:"Beginner",idempotencyKey:randomUUID(),
  })).structuredContent.data;
  const studentUpdate=(await call("ccp_v1_students_update",{
    studentId:madeStudent.entityId,level:"Intermediate",
    expectedUpdatedAt:madeStudent.revision,idempotencyKey:randomUUID(),
  })).structuredContent.data;
  expect(studentUpdate.revision).not.toBe(madeStudent.revision);
  expect((await postDomain({action:"students.search",query:"MCP learner "+suffix}))
    .find((s:{id:string})=>s.id===madeStudent.entityId).level).toBe("Intermediate");
  const joined=(await call("ccp_v1_workplaces_enroll",{
    workplaceId:madeWorkplace.entityId,studentId:madeStudent.entityId,
    idempotencyKey:randomUUID(),
  })).structuredContent;
  expect(joined.data.operation).toBe("workplaces.enroll");
  const enrollments=(await call("ccp_v1_workplaces_enrollments",{
    workplaceId:madeWorkplace.entityId,
  })).structuredContent.data;
  expect(enrollments.some((r:{student_id:string})=>r.student_id===madeStudent.entityId)).toBe(true);

  const madeGroup=(await call("ccp_v1_groups_create",{
    workplaceId:madeWorkplace.entityId,name:"MCP group "+suffix,idempotencyKey:randomUUID(),
  })).structuredContent.data;
  const revisedGroup=(await call("ccp_v1_groups_update",{
    groupId:madeGroup.entityId,workplaceId:madeWorkplace.entityId,
    name:"Updated MCP group "+suffix,expectedUpdatedAt:madeGroup.revision,
    idempotencyKey:randomUUID(),
  })).structuredContent.data;
  expect(revisedGroup.revision).not.toBe(madeGroup.revision);
  const enrollArgs={groupId:madeGroup.entityId,studentId:madeStudent.entityId,
    idempotencyKey:randomUUID()};
  const groupEnroll=(await call("ccp_v1_groups_enroll",enrollArgs)).structuredContent.data;
  expect((await call("ccp_v1_groups_enroll",enrollArgs)).structuredContent.data).toEqual(groupEnroll);
  expect((await call("ccp_v1_groups_members",{groupId:madeGroup.entityId}))
    .structuredContent.data).toHaveLength(1);

  const lessonArgs={workplaceId:madeWorkplace.entityId,groupId:madeGroup.entityId,
    title:"MCP new lesson "+suffix,startsAt:"2027-06-21T10:00:00.000Z",
    durationMinutes:60,lessonNote:"Synthetic",idempotencyKey:randomUUID()};
  const scheduled=(await call("ccp_v1_sessions_create",lessonArgs)).structuredContent.data;
  expect((await call("ccp_v1_sessions_create",lessonArgs)).structuredContent.data).toEqual(scheduled);
  const lessonDetails=(await call("ccp_v1_sessions_details",{
    sessionId:scheduled.entityId,
  })).structuredContent.data;
  expect(lessonDetails.participants).toHaveLength(1);
  const collided=await call("ccp_v1_sessions_create",{
    ...lessonArgs,title:"Overlaps",idempotencyKey:randomUUID(),
  });
  expect(collided.isError).toBe(true);
  expect(collided.structuredContent.error.code).toBe("CONFLICT");

  const rescheduleArgs={sessionId:scheduled.entityId,startsAt:"2027-06-22T10:00:00.000Z",
    durationMinutes:45,expectedUpdatedAt:scheduled.revision,
    confirmed:true,idempotencyKey:randomUUID()};
  const moved=(await call("ccp_v1_sessions_reschedule",rescheduleArgs)).structuredContent.data;
  expect((await call("ccp_v1_sessions_reschedule",rescheduleArgs)).structuredContent.data).toEqual(moved);
  const staleMove=await call("ccp_v1_sessions_reschedule",{
    ...rescheduleArgs,startsAt:"2027-06-23T10:00:00.000Z",idempotencyKey:randomUUID(),
  });
  expect(staleMove.isError).toBe(true);
  expect(staleMove.structuredContent.error.code).toBe("CONFLICT");
  const fromSite=(await postDomain({action:"sessions.list"}))
    .find((s:{id:string})=>s.id===scheduled.entityId);
  expect(new Date(fromSite.starts_at).toISOString()).toBe("2027-06-22T10:00:00.000Z");
  expect(fromSite.duration_minutes).toBe(45);
  // Website corrections remain available after a delegated tool action.
  await postDomain({action:"sessions.update",sessionId:scheduled.entityId,
    lessonNote:"Website correction after MCP"});
  const corrected=(await call("ccp_v1_sessions_details",{
    sessionId:scheduled.entityId,
  })).structuredContent.data;
  expect(corrected.lesson_note).toBe("Website correction after MCP");
  const canceled=(await call("ccp_v1_sessions_cancel",{
    sessionId:scheduled.entityId,expectedUpdatedAt:corrected.updated_at,
    idempotencyKey:randomUUID(),confirmed:true,
  })).structuredContent.data;
  expect(canceled.operation).toBe("sessions.cancel");

  // A membership change cannot rewrite a frozen historical lesson roster.
  const removed=(await call("ccp_v1_groups_unenroll",{
    groupId:madeGroup.entityId,studentId:madeStudent.entityId,
    idempotencyKey:randomUUID(),confirmed:true,
  })).structuredContent.data;
  expect(removed.operation).toBe("groups.unenroll");
  expect((await call("ccp_v1_groups_members",{groupId:madeGroup.entityId}))
    .structuredContent.data).toHaveLength(0);
  expect((await call("ccp_v1_sessions_details",{sessionId:scheduled.entityId}))
    .structuredContent.data.participants).toHaveLength(1);

  const blockedTenant=await call("ccp_v1_groups_create",{
    workplaceId:foreignWorkplace!.id,name:"Cross-tenant attempt",
    idempotencyKey:randomUUID(),
  });
  expect(blockedTenant.isError).toBe(true);
  expect(blockedTenant.structuredContent.error.code).toBe("NOT_FOUND");
  const blockedStudent=await call("ccp_v1_workplaces_enroll",{
    workplaceId:madeWorkplace.entityId,studentId:foreignStudent!.id,
    idempotencyKey:randomUUID(),
  });
  expect(blockedStudent.isError).toBe(true);
  expect(blockedStudent.structuredContent.error.code).toBe("NOT_FOUND");

  // Browser/MCP student profile parity: chess fields, notes, aliases, archived records.
  for (const toolName of ["ccp_v1_students_roster","ccp_v1_students_profile",
    "ccp_v1_students_profile_edit"]) expect(names).toContain(toolName);
  const profileId=madeStudent.entityId;
  const oldProfile=(await call("ccp_v1_students_profile",{studentId:profileId})).structuredContent.data;
  const oldSite=await page.request.get("/api/students/"+profileId);
  expect(oldSite.status()).toBe(200);
  expect(oldProfile.name).toBe((await oldSite.json()).name);
  expect(oldProfile.teacher_notes).toBeUndefined();
  const aliases=["כינוי סינתטי "+suffix,"Synthetic alias "+suffix];
  const profileEdit=(await call("ccp_v1_students_profile_edit",{
    studentId:profileId,expectedUpdatedAt:oldProfile.updated_at,confirmed:true,
    changes:{nameAliases:aliases,strength:7,lichessUsername:"lichess_test",
      chesscomUsername:"Chesscom_test",lichessRating:1450,chesscomRating:1510,
      teacherNotes:"Private synthetic notes"},
  })).structuredContent;
  expect(profileEdit.error).toBeUndefined();
  expect(profileEdit.data.strength).toBe(7);
  const webProfile=await page.request.get("/api/students/"+profileId);
  expect(webProfile.status()).toBe(200);
  const actualProfile=await webProfile.json();
  expect(actualProfile.name_aliases).toEqual(aliases);
  expect(actualProfile.teacher_notes).toBe("Private synthetic notes");
  expect(actualProfile.lichess_rating).toBe(1450);
  const aliasSearch=(await call("ccp_v1_students_search",{query:aliases[0]})).structuredContent;
  expect(aliasSearch.error).toBeUndefined();
  expect(aliasSearch.data.some((row:{id:string})=>row.id===profileId)).toBe(true);
  expect(aliasSearch.data.find((row:{id:string})=>row.id===profileId).teacher_notes).toBeUndefined();
  const privateProfile=(await call("ccp_v1_students_profile",{
    studentId:profileId,includePrivate:true,confirmed:true,
  })).structuredContent.data;
  expect(privateProfile.teacher_notes).toBe("Private synthetic notes");
  const staleEdit=(await call("ccp_v1_students_profile_edit",{
    studentId:profileId,expectedUpdatedAt:oldProfile.updated_at,confirmed:true,
    changes:{strength:6},
  })).structuredContent;
  expect(staleEdit.error.code).toBe("CONFLICT");
  const roster=(await call("ccp_v1_students_roster",{
    includeArchived:true,offset:0,limit:100,
  })).structuredContent.data;
  expect(roster.students.some((row:{id:string})=>row.id===profileId)).toBe(true);
  expect(roster.students.find((row:{id:string})=>row.id===profileId).teacher_notes).toBeUndefined();
  const forbiddenProfile=(await call("ccp_v1_students_profile",{
    studentId:foreignStudent!.id,
  })).structuredContent;
  expect(forbiddenProfile.error.code).toBe("NOT_FOUND");
  const archive=(await call("ccp_v1_students_profile_edit",{
    studentId:profileId,expectedUpdatedAt:actualProfile.updated_at,confirmed:true,
    changes:{archived:true},
  })).structuredContent;
  expect(archive.error).toBeUndefined();
  expect(archive.data.archived_at).toBeTruthy();
  const activeRoster=(await call("ccp_v1_students_roster",{
    includeArchived:false,limit:100,
  })).structuredContent.data.students;
  expect(activeRoster.some((row:{id:string})=>row.id===profileId)).toBe(false);
  const archivedFromWebsite=await page.request.get("/api/students/"+profileId);
  expect((await archivedFromWebsite.json()).archived_at).toBeTruthy();
  const restore=(await page.request.put("/api/students/"+profileId,{
    data:{archived:false},
  }));
  expect(restore.status(),await restore.text()).toBe(200);
  expect((await restore.json()).archived_at).toBeNull();

  // Skill dimensions and append-only assessments use the same scoped
  // website/MCP service. Never delete seed dimensions or another coach's data.
  for(const toolName of ["ccp_v1_skill_dimensions_list","ccp_v1_skill_dimensions_create",
    "ccp_v1_skill_dimensions_update","ccp_v1_skill_dimensions_delete_impact",
    "ccp_v1_skill_dimensions_delete","ccp_v1_student_skill_assessments_list",
    "ccp_v1_student_skill_assessments_record"])expect(names).toContain(toolName);
  const skillsSite=await page.request.get("/api/skills/dimensions");
  expect(skillsSite.status()).toBe(200);
  const skillTool=await call("ccp_v1_skill_dimensions_list",{});
  expect(skillTool.structuredContent.data).toEqual(await skillsSite.json());
  const freshDimension=await call("ccp_v1_skill_dimensions_create",{
    name:"Synthetic chess tactics "+suffix,confirmed:true,
  });
  expect(freshDimension.isError).toBe(false);
  const dimId=freshDimension.structuredContent.data.id as string;
  const rename=await page.request.put("/api/skills/dimensions/"+dimId,{
    data:{name:"Synthetic chess calculation "+suffix},
  });
  expect(rename.status(),await rename.text()).toBe(200);
  const refreshedSkills=(await call("ccp_v1_skill_dimensions_list",{})).structuredContent.data;
  expect(refreshedSkills.find((x:{id:string})=>x.id===dimId).name)
    .toBe("Synthetic chess calculation "+suffix);
  const assessed=await call("ccp_v1_student_skill_assessments_record",{
    studentId:profileId,confirmed:true,
    ratings:[{dimensionId:dimId,rating:4,note:"Synthetic tactical pattern"}],
  });
  expect(assessed.isError).toBe(false);
  const assessmentId=assessed.structuredContent.data[0].id as string;
  const skillHistory=await page.request.get("/api/students/"+profileId+"/skills");
  expect(skillHistory.status()).toBe(200);
  expect((await skillHistory.json()).some((x:{id:string})=>x.id===assessmentId)).toBe(true);
  const mcpHistory=(await call("ccp_v1_student_skill_assessments_list",{
    studentId:profileId,
  })).structuredContent.data;
  expect(mcpHistory.some((x:{id:string})=>x.id===assessmentId)).toBe(true);
  const deniedSkill=(await call("ccp_v1_student_skill_assessments_list",{
    studentId:foreignStudent!.id,
  })).structuredContent;
  expect(deniedSkill.error.code).toBe("NOT_FOUND");
  const preview=(await call("ccp_v1_skill_dimensions_delete_impact",{
    dimensionId:dimId,
  })).structuredContent.data;
  expect(preview.assessmentCount).toBe(1);
  const rejectWrongCount=(await call("ccp_v1_skill_dimensions_delete",{
    dimensionId:dimId,expectedAssessmentCount:0,confirmed:true,
  })).structuredContent;
  expect(rejectWrongCount.error.code).toBe("CONFLICT");
  const deletedSkill=(await call("ccp_v1_skill_dimensions_delete",{
    dimensionId:dimId,expectedAssessmentCount:1,confirmed:true,
  })).structuredContent;
  expect(deletedSkill.error).toBeUndefined();
  expect(deletedSkill.data.deletedAssessmentCount).toBe(1);
  const afterDeletion=await page.request.get("/api/students/"+profileId+"/skills");
  expect((await afterDeletion.json()).some((x:{id:string})=>x.id===assessmentId)).toBe(false);

  // A delegated read-only OAuth grant must neither list nor invoke any write
  // tool, even if the client guesses a valid, versioned tool name.
  const roReg=await request.post("/oauth/register",{data:{
    client_name:"Read-only synthetic MCP",redirect_uris:[callback],
    token_endpoint_auth_method:"none",
  }});
  expect(roReg.status()).toBe(201);
  const roClientId=(await roReg.json()).client_id as string;
  const roParams=new URLSearchParams({
    client_id:roClientId,redirect_uri:callback,response_type:"code",
    resource,code_challenge_method:"S256",code_challenge:challenge,
    state:"read-only-synthetic",scope:"coach:read",
  });
  await page.goto("/oauth/authorize?"+roParams.toString());
  await expect(page.getByRole("heading",{name:"Authorize AI connector"})).toBeVisible();
  await page.getByRole("button",{name:"Authorize"}).click();
  await page.waitForURL(u=>u.pathname==="/oauth/synthetic-callback" &&
    u.searchParams.has("code"),{waitUntil:"commit",timeout:20000});
  const roCode=new URL(page.url()).searchParams.get("code")!;
  const roResp=await request.post("/oauth/token",{form:{
    grant_type:"authorization_code",client_id:roClientId,redirect_uri:callback,
    code:roCode,code_verifier:verifier,resource,
  }});
  expect(roResp.status(),await roResp.text()).toBe(200);
  const roToken=(await roResp.json()).access_token as string;
  const roCall=async (method:string,params?:unknown)=>{
    const res=await request.post("/mcp",{headers:{
      Authorization:"Bearer "+roToken,"MCP-Protocol-Version":"2025-06-18",
    },data:{jsonrpc:"2.0",id:randomUUID(),method,params}});
    expect(res.status(),await res.text()).toBe(200);
    return (await res.json()).result;
  };
  const roNames=(await roCall("tools/list")).tools.map((x:{name:string})=>x.name);
  expect(roNames).toContain("ccp_v1_students_search");
  expect(roNames).not.toContain("ccp_v1_students_create");
  expect(roNames).not.toContain("ccp_v1_sessions_cancel");
  const forbiddenWrite=await roCall("tools/call",{
    name:"ccp_v1_students_create",arguments:{
      name:"Never create with read-only token",idempotencyKey:randomUUID(),
    },
  });
  expect(forbiddenWrite.isError).toBe(true);
  expect(forbiddenWrite.structuredContent.error.code).toBe("FORBIDDEN");

  const connections=await page.request.get("/api/agent/connections");
  expect(connections.status()).toBe(200);
  const grants=(await connections.json()).connections as {id:string;client_id:string}[];
  const grant=grants.find(g=>g.client_id===clientId);
  expect(grant).toBeTruthy();
  // Expiration rejects the old access token. Refresh rotates both credentials.
  const {error:expireError}=await admin.from("agent_oauth_grants").update({
    access_expires_at:new Date(Date.now()-60000).toISOString(),
  }).eq("id",grant!.id);
  expect(expireError).toBeNull();
  const expired=await request.post("/mcp",{
    headers:{Authorization:"Bearer "+token.access_token},
    data:{jsonrpc:"2.0",id:8,method:"tools/list"},
  });
  expect(expired.status()).toBe(401);
  const refreshed=await request.post("/oauth/token",{form:{
    grant_type:"refresh_token",client_id:clientId,resource,
    refresh_token:token.refresh_token,
  }});
  expect(refreshed.status(),await refreshed.text()).toBe(200);
  const rotated=await refreshed.json();
  expect(rotated.access_token).not.toBe(token.access_token);
  const replayRefresh=await request.post("/oauth/token",{form:{
    grant_type:"refresh_token",client_id:clientId,resource,
    refresh_token:token.refresh_token,
  }});
  expect(replayRefresh.status()).toBe(400);
  const active=await request.post("/mcp",{
    headers:{Authorization:"Bearer "+rotated.access_token},
    data:{jsonrpc:"2.0",id:9,method:"tools/list"},
  });
  expect(active.status(),await active.text()).toBe(200);
  const revoke=await page.request.delete("/api/agent/connections",{
    headers:{Origin:origin},data:{id:grant!.id},
  });
  expect(revoke.status(),await revoke.text()).toBe(200);
  const blocked=await request.post("/mcp",{
    headers:{Authorization:"Bearer "+rotated.access_token},
    data:{jsonrpc:"2.0",id:10,method:"tools/list"},
  });
  expect(blocked.status()).toBe(401);
});
