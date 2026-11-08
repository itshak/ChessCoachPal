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
  const dimensionPreview=(await call("ccp_v1_skill_dimensions_delete_impact",{
    dimensionId:dimId,
  })).structuredContent.data;
  expect(dimensionPreview.assessmentCount).toBe(1);
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

  // Guardian/contact lifecycle parity with secret redaction and cross-tenant denial.
  for(const toolName of ["ccp_v1_guardians_list","ccp_v1_guardians_detail",
    "ccp_v1_guardians_create","ccp_v1_guardians_update",
    "ccp_v1_guardians_delete_impact","ccp_v1_guardians_delete",
    "ccp_v1_guardians_rotate_portal_token"])expect(names).toContain(toolName);
  const newFamily=(await call("ccp_v1_guardians_create",{
    name:"Synthetic chess family "+suffix,email:"synthetic-"+suffix+"@example.com",
    confirmed:true,
  })).structuredContent;
  expect(newFamily.error).toBeUndefined();
  expect(newFamily.data.portal_token).toBeUndefined();
  expect(newFamily.data.email).toBeUndefined();
  const gid=newFamily.data.id as string;
  const familyWebsite=await page.request.get("/api/guardians/"+gid);
  expect(familyWebsite.status()).toBe(200);
  const originalPortal=(await familyWebsite.json()).portal_token as string;
  expect(originalPortal).toBeTruthy();
  const contact=(await call("ccp_v1_guardians_detail",{
    guardianId:gid,includeContacts:true,confirmed:true,
  })).structuredContent.data;
  expect(contact.email).toContain("synthetic-");
  expect(contact.portal_token).toBeUndefined();
  const editFamily=await page.request.put("/api/guardians/"+gid,{
    data:{familyName:"Chess academy test "+suffix},
  });
  expect(editFamily.status(),await editFamily.text()).toBe(200);
  const familyFromMcp=(await call("ccp_v1_guardians_detail",{
    guardianId:gid,
  })).structuredContent.data;
  expect(familyFromMcp.family_name).toBe("Chess academy test "+suffix);
  const rotation=(await call("ccp_v1_guardians_rotate_portal_token",{
    guardianId:gid,confirmed:true,
  })).structuredContent;
  expect(rotation.error).toBeUndefined();
  expect(rotation.data.secretNotReturned).toBe(true);
  expect(rotation.data.portal_token).toBeUndefined();
  const afterRotation=await page.request.get("/api/guardians/"+gid);
  expect((await afterRotation.json()).portal_token).not.toBe(originalPortal);
  const impact=(await call("ccp_v1_guardians_delete_impact",{
    guardianId:gid,
  })).structuredContent.data;
  expect(impact.studentCount).toBe(0);
  expect(impact.invoiceCount).toBe(0);
  const deleteFamily=(await call("ccp_v1_guardians_delete",{
    guardianId:gid,confirmed:true,
  })).structuredContent;
  expect(deleteFamily.error).toBeUndefined();
  const afterFamilyDelete=await page.request.get("/api/guardians/"+gid);
  expect(afterFamilyDelete.status()).toBe(404);
  // No model-visible family portal secrets, even for a foreign teacher UUID.
  const {data:otherFamily,error:otherFamilyError}=await admin.from("guardians").insert({
    teacher_id:otherId,name:"Other coach guardian "+suffix,portal_token:randomUUID(),
  }).select("id").single();
  expect(otherFamilyError).toBeNull();
  const foreignFamily=(await call("ccp_v1_guardians_detail",{
    guardianId:otherFamily!.id,includeContacts:true,confirmed:true,
  })).structuredContent;
  expect(foreignFamily.error.code).toBe("NOT_FOUND");

  // Private legacy calendar differs from group teaching_sessions, but
  // website and delegated MCP now use the same tenant-scoped calendar service.
  for(const toolName of ["ccp_v1_calendar_slots_list","ccp_v1_calendar_slots_create",
    "ccp_v1_calendar_slots_update","ccp_v1_calendar_slots_delete",
    "ccp_v1_calendar_lessons_list","ccp_v1_calendar_lessons_detail",
    "ccp_v1_calendar_lessons_create","ccp_v1_calendar_lessons_update",
    "ccp_v1_calendar_lessons_delete"])expect(names).toContain(toolName);
  const slotMade=(await call("ccp_v1_calendar_slots_create",{
    studentId:profileId,dayOfWeek:0,startTime:"17:00",durationMinutes:45,
    startDate:"2026-11-15",endDate:"2026-12-06",confirmed:true,
  })).structuredContent;
  expect(slotMade.error).toBeUndefined();
  const slotId=slotMade.data.id as string;
  const browserSlot=await page.request.get("/api/schedule/slots?studentId="+profileId);
  expect(browserSlot.status(),await browserSlot.text()).toBe(200);
  expect((await browserSlot.json()).some((x:{id:string})=>x.id===slotId)).toBe(true);
  const slotUpdated=await page.request.put("/api/schedule/slots/"+slotId,{
    data:{rateCents:2300},
  });
  expect(slotUpdated.status(),await slotUpdated.text()).toBe(200);
  const listedSlots=(await call("ccp_v1_calendar_slots_list",{
    studentId:profileId,
  })).structuredContent.data;
  expect(listedSlots.find((x:{id:string})=>x.id===slotId).rate_cents).toBe(2300);
  const deletedSlot=(await call("ccp_v1_calendar_slots_delete",{
    slotId,confirmed:true,
  })).structuredContent;
  expect(deletedSlot.error).toBeUndefined();
  const afterSlotDelete=await page.request.get("/api/schedule/slots?studentId="+profileId);
  expect((await afterSlotDelete.json()).some((x:{id:string})=>x.id===slotId)).toBe(false);
  const madeLegacy=(await call("ccp_v1_calendar_lessons_create",{
    studentId:profileId,date:"2026-11-18",time:"17:30",durationMinutes:45,
    confirmed:true,
  })).structuredContent;
  expect(madeLegacy.error).toBeUndefined();
  const legacyId=madeLegacy.data.id as string;
  const browserLegacy=await page.request.get("/api/schedule/lessons/"+legacyId);
  expect(browserLegacy.status()).toBe(200);
  expect((await browserLegacy.json()).student_id).toBe(profileId);
  const updatedLegacy=await page.request.put("/api/schedule/lessons/"+legacyId,{
    data:{isHomeVisit:true},
  });
  expect(updatedLegacy.status(),await updatedLegacy.text()).toBe(200);
  const fromMcp=(await call("ccp_v1_calendar_lessons_detail",{
    lessonId:legacyId,
  })).structuredContent.data;
  expect(fromMcp.is_home_visit).toBe(true);
  const legacyListed=(await call("ccp_v1_calendar_lessons_list",{
    studentId:profileId,limit:100,offset:0,
  })).structuredContent.data;
  expect(legacyListed.lessons.some((x:{id:string})=>x.id===legacyId)).toBe(true);
  const foreignCalendar=(await call("ccp_v1_calendar_lessons_create",{
    studentId:foreignStudent!.id,date:"2026-11-20",time:"16:00",
    confirmed:true,
  })).structuredContent;
  expect(foreignCalendar.error.code).toBe("NOT_FOUND");
  const removedLegacy=(await call("ccp_v1_calendar_lessons_delete",{
    lessonId:legacyId,confirmed:true,
  })).structuredContent;
  expect(removedLegacy.error).toBeUndefined();
  const noLesson=await page.request.get("/api/schedule/lessons/"+legacyId);
  expect(noLesson.status()).toBe(404);

  // Teacher-scoped one-on-one attendance, notes and bulk corrections.
  // Explicit email flags default false: synthetic tests must send no family email.
  for(const toolName of ["ccp_v1_calendar_attendance_read","ccp_v1_calendar_attendance_record",
    "ccp_v1_calendar_attendance_bulk","ccp_v1_calendar_lesson_note_read",
    "ccp_v1_calendar_lesson_note_update"])expect(names).toContain(toolName);
  const attendanceLesson=(await call("ccp_v1_calendar_lessons_create",{
    studentId:profileId,date:"2026-11-24",time:"18:00",durationMinutes:50,
    confirmed:true,
  })).structuredContent;
  expect(attendanceLesson.error).toBeUndefined();
  const attendanceLessonId=attendanceLesson.data.id as string;
  const recordAttendance=(await call("ccp_v1_calendar_attendance_record",{
    lessonId:attendanceLessonId,status:"attended",notifyFamily:false,
    confirmed:true,
  })).structuredContent;
  expect(recordAttendance.error).toBeUndefined();
  expect(recordAttendance.data.status).toBe("attended");
  const attendanceSite=await page.request.get("/api/schedule/lessons/"+attendanceLessonId+"/attendance");
  expect(attendanceSite.status()).toBe(200);
  expect((await attendanceSite.json()).status).toBe("attended");
  const noteFromTool=(await call("ccp_v1_calendar_lesson_note_update",{
    lessonId:attendanceLessonId,body:"Studied opposition in king-and-pawn endings",
    privateBody:"Teacher-only: calculate slower",sendEmail:false,confirmed:true,
  })).structuredContent;
  expect(noteFromTool.error).toBeUndefined();
  expect(noteFromTool.data.emailed).toBe(false);
  const noteSite=await page.request.get("/api/schedule/lessons/"+attendanceLessonId+"/note");
  expect(noteSite.status()).toBe(200);
  expect((await noteSite.json()).private_body).toBe("Teacher-only: calculate slower");
  const maskedNote=(await call("ccp_v1_calendar_lesson_note_read",{
    lessonId:attendanceLessonId,
  })).structuredContent.data;
  expect(maskedNote.private_body).toBeUndefined();
  const fullNote=(await call("ccp_v1_calendar_lesson_note_read",{
    lessonId:attendanceLessonId,includePrivate:true,confirmed:true,
  })).structuredContent.data;
  expect(fullNote.private_body).toBe("Teacher-only: calculate slower");
  const otherLesson=(await page.request.post("/api/schedule/lessons",{
    data:{studentId:profileId,date:"2026-11-25",time:"18:00",durationMinutes:40},
  }));
  expect(otherLesson.status(),await otherLesson.text()).toBe(200);
  const otherLessonId=(await otherLesson.json()).id as string;
  const bulk=(await call("ccp_v1_calendar_attendance_bulk",{
    ids:[otherLessonId,randomUUID()],status:"no_show",notifyFamily:false,
    confirmed:true,
  })).structuredContent;
  expect(bulk.error).toBeUndefined();
  expect(bulk.data.succeeded).toBe(1);
  expect(bulk.data.failed).toHaveLength(1);
  const bulkSite=await page.request.get("/api/schedule/lessons/"+otherLessonId+"/attendance");
  expect((await bulkSite.json()).status).toBe("no_show");
  const forbiddenAttendance=(await call("ccp_v1_calendar_attendance_read",{
    lessonId:foreignStudent!.id,
  })).structuredContent;
  expect(forbiddenAttendance.error.code).toBe("NOT_FOUND");

  // Teacher-scoped events share website/MCP domain service. No emails sent in synthetic test.
  for(const toolName of ["ccp_v1_events_list","ccp_v1_events_detail",
    "ccp_v1_events_create","ccp_v1_events_update","ccp_v1_events_delete_impact",
    "ccp_v1_events_delete","ccp_v1_events_email_invites"])expect(names).toContain(toolName);
  const eventAdded=(await call("ccp_v1_events_create",{
    title:"Synthetic chess tournament "+suffix,startsAt:"2026-12-18T16:00:00+02:00",
    endsAt:"2026-12-18T18:00:00+02:00",
    location:"Test chess classroom",studentIds:[profileId],confirmed:true,
  })).structuredContent;
  expect(eventAdded.error).toBeUndefined();
  const testEventId=eventAdded.data.event.id as string;
  const eventSite=await page.request.get("/api/events/"+testEventId);
  expect(eventSite.status(),await eventSite.text()).toBe(200);
  const siteEvent=(await eventSite.json()).event;
  expect(siteEvent.students.some((x:{studentId:string})=>x.studentId===profileId)).toBe(true);
  const agentEvent=(await call("ccp_v1_events_detail",{eventId:testEventId})).structuredContent.data.event;
  expect(agentEvent.title).toBe(siteEvent.title);
  expect(agentEvent.rsvps).toEqual([]);
  const eventsOverview=(await call("ccp_v1_events_list",{})).structuredContent.data.events;
  expect(eventsOverview.some((x:{id:string})=>x.id===testEventId)).toBe(true);
  const eventUpdate=await page.request.put("/api/events/"+testEventId,{data:{location:"Updated lesson venue"}});
  expect(eventUpdate.status(),await eventUpdate.text()).toBe(200);
  expect((await call("ccp_v1_events_detail",{eventId:testEventId})).structuredContent.data.event.location)
    .toBe("Updated lesson venue");
  const eventImpact=(await call("ccp_v1_events_delete_impact",{
    eventId:testEventId,
  })).structuredContent.data;
  expect(eventImpact.studentCount).toBe(1);
  const invalidEvent=await call("ccp_v1_events_detail",{eventId:randomUUID()});
  expect(invalidEvent.structuredContent.error.code).toBe("NOT_FOUND");
  const removedEvent=(await call("ccp_v1_events_delete",{
    eventId:testEventId,confirmed:true,
  })).structuredContent;
  expect(removedEvent.error).toBeUndefined();
  const eventMissing=await page.request.get("/api/events/"+testEventId);
  expect(eventMissing.status()).toBe(404);

  // Studio preferences share the same validation and secret-masking service.
  for(const toolName of ["ccp_v1_studio_policy_get","ccp_v1_studio_policy_update"])
    expect(names).toContain(toolName);
  const webPolicyResponse=await page.request.get("/api/settings/policy");
  expect(webPolicyResponse.status(),await webPolicyResponse.text()).toBe(200);
  const originalPolicy=await webPolicyResponse.json();
  const mcpPolicy=(await call("ccp_v1_studio_policy_get",{})).structuredContent.data;
  expect(mcpPolicy.studio_name).toBe(originalPolicy.studio_name);
  expect(mcpPolicy.timezone).toBe(originalPolicy.timezone);
  expect(mcpPolicy.stripe_secret_key).toBeNull();
  expect(mcpPolicy.ai_api_key).toBeNull();
  expect(mcpPolicy.payment_qr_code).toBeNull();
  const updatedPolicy=(await call("ccp_v1_studio_policy_update",{
    changes:{studioName:"Synthetic chess academy "+suffix},confirmed:true,
  })).structuredContent;
  expect(updatedPolicy.error).toBeUndefined();
  expect(updatedPolicy.data.studio_name).toBe("Synthetic chess academy "+suffix);
  const policyBrowser=await page.request.get("/api/settings/policy");
  expect((await policyBrowser.json()).studio_name).toBe("Synthetic chess academy "+suffix);
  const restorePolicy=await page.request.put("/api/settings/policy",{
    data:{studioName:originalPolicy.studio_name},
  });
  expect(restorePolicy.status(),await restorePolicy.text()).toBe(200);

  // Read-only financial parity. Seed a fully owned invoice and payment
  // through CI's service role, then compare website CSV and MCP output.
  for(const toolName of ["ccp_v1_billing_invoices_list",
    "ccp_v1_billing_invoice_detail","ccp_v1_billing_payments_export"])
    expect(names).toContain(toolName);
  const {data:acctGuardian,error:acctGError}=await admin.from("guardians").insert({
    teacher_id:session!.user.id,name:"Accounting family "+suffix,
    email:"accounting-"+suffix+"@example.com",portal_token:randomUUID(),
  }).select("id").single();
  expect(acctGError).toBeNull();
  const {data:acctInvoice,error:acctIError}=await admin.from("invoices").insert({
    teacher_id:session!.user.id,guardian_id:acctGuardian!.id,status:"sent",
    period_start:"2026-11-01",period_end:"2026-11-30",currency:"USD",subtotal_cents:12500,
  }).select("id").single();
  expect(acctIError).toBeNull();
  const {error:acctPError}=await admin.from("payments").insert({
    invoice_id:acctInvoice!.id,amount_cents:2500,method:"manual",note:"=2+2",
  });
  expect(acctPError).toBeNull();
  const websiteBill=await page.request.get("/api/billing/invoices/"+acctInvoice!.id);
  expect(websiteBill.status(),await websiteBill.text()).toBe(200);
  const originalBill=await websiteBill.json();
  expect(originalBill.guardians.portal_token).toBeTruthy();
  const safeBill=(await call("ccp_v1_billing_invoice_detail",{
    invoiceId:acctInvoice!.id,
  })).structuredContent.data;
  expect(safeBill.id).toBe(originalBill.id);
  expect(safeBill.guardians.portal_token).toBeUndefined();
  expect(safeBill.stripe_checkout_url).toBeUndefined();
  expect(safeBill.guardians.email).toBeUndefined();
  expect(safeBill.payments[0].note).toBeUndefined();
  const confirmedBill=(await call("ccp_v1_billing_invoice_detail",{
    invoiceId:acctInvoice!.id,includePrivate:true,confirmed:true,
  })).structuredContent.data;
  expect(confirmedBill.guardians.email).toContain("accounting-");
  expect(confirmedBill.guardians.portal_token).toBeUndefined();
  const billPage=(await call("ccp_v1_billing_invoices_list",{limit:100,offset:0}))
    .structuredContent.data.invoices;
  expect(billPage.some((x:{id:string})=>x.id===acctInvoice!.id)).toBe(true);
  const accountCsvSite=await page.request.get("/api/billing/export?from=2026-11-01&to=2026-11-30");
  expect(accountCsvSite.status(),await accountCsvSite.text()).toBe(200);
  const accountCsvMcp=(await call("ccp_v1_billing_payments_export",{
    from:"2026-11-01",to:"2026-11-30",confirmed:true,
  })).structuredContent.data;
  expect(accountCsvMcp.csv).toBe(await accountCsvSite.text());
  expect(accountCsvMcp.csv).toContain("'=2+2");

  // Financial mutations require explicit teacher confirmation and status checks.
  // No email is sent in the mutation tests.
  for(const toolName of ["ccp_v1_billing_invoice_draft_update",
    "ccp_v1_billing_invoice_void","ccp_v1_billing_invoice_delete",
    "ccp_v1_billing_invoice_send"])expect(names).toContain(toolName);
  const {data:mutableInvoice,error:mutableError}=await admin.from("invoices").insert({
    teacher_id:session!.user.id,guardian_id:acctGuardian!.id,status:"draft",
    period_start:"2027-01-01",period_end:"2027-01-31",currency:"USD",subtotal_cents:0,
  }).select("id").single();
  expect(mutableError).toBeNull();
  const mutableId=mutableInvoice!.id as string;
  const changedDraft=(await call("ccp_v1_billing_invoice_draft_update",{
    invoiceId:mutableId,changes:{notes:"Synthetic reviewed draft "+suffix},confirmed:true,
  })).structuredContent;
  expect(changedDraft.error).toBeUndefined();
  const changedFromSite=await page.request.get("/api/billing/invoices/"+mutableId);
  expect(changedFromSite.status(),await changedFromSite.text()).toBe(200);
  expect((await changedFromSite.json()).notes).toBe("Synthetic reviewed draft "+suffix);
  const voidedDraft=(await call("ccp_v1_billing_invoice_void",{
    invoiceId:mutableId,confirmed:true,
  })).structuredContent;
  expect(voidedDraft.error).toBeUndefined();
  const voidSite=await page.request.get("/api/billing/invoices/"+mutableId);
  expect((await voidSite.json()).status).toBe("void");
  const deletedDraft=(await call("ccp_v1_billing_invoice_delete",{
    invoiceId:mutableId,confirmed:true,
  })).structuredContent;
  expect(deletedDraft.error).toBeUndefined();
  const noDraft=await page.request.get("/api/billing/invoices/"+mutableId);
  expect(noDraft.status()).toBe(404);
  const invalidInvoice=(await call("ccp_v1_billing_invoice_void",{
    invoiceId:randomUUID(),confirmed:true,
  })).structuredContent;
  expect(invalidInvoice.error.code).toBe("NOT_FOUND");

  // Prepaid chess lessons: draft invoice and balance parity, no charge/email.
  for(const toolName of ["ccp_v1_credits_packages_list","ccp_v1_credits_package_create",
    "ccp_v1_credits_package_expiry","ccp_v1_credits_redemption_return"])
    expect(names).toContain(toolName);
  const linkForCredits=await page.request.put("/api/students/"+profileId,{
    data:{guardianId:acctGuardian!.id},
  });
  expect(linkForCredits.status(),await linkForCredits.text()).toBe(200);
  const prepaidPackage=(await call("ccp_v1_credits_package_create",{
    studentId:profileId,credits:4,durationMinutes:45,priceCents:10000,
    startsOn:"2026-11-08",expiresOn:"2027-03-31",confirmed:true,
  })).structuredContent;
  expect(prepaidPackage.error).toBeUndefined();
  const prepaidId=prepaidPackage.data.packageId as string;
  const prepaidInvoice=await page.request.get("/api/billing/invoices/"+prepaidPackage.data.invoiceId);
  expect(prepaidInvoice.status(),await prepaidInvoice.text()).toBe(200);
  expect((await prepaidInvoice.json()).invoice_items.some((x:{kind:string})=>x.kind==="credit_package"))
    .toBe(true);
  const prepaidWebsite=await page.request.get("/api/billing/credit-packages?studentId="+profileId);
  expect(prepaidWebsite.status(),await prepaidWebsite.text()).toBe(200);
  const prepaidWebList=(await prepaidWebsite.json()).packages;
  const prepaidMcpList=(await call("ccp_v1_credits_packages_list",{
    studentId:profileId,
  })).structuredContent.data.packages;
  expect(prepaidMcpList).toEqual(prepaidWebList);
  expect(prepaidMcpList.some((x:{id:string})=>x.id===prepaidId)).toBe(true);
  const expiryChanged=await page.request.patch("/api/billing/credit-packages/"+prepaidId,{
    data:{expiresOn:"2027-04-30"},
  });
  expect(expiryChanged.status(),await expiryChanged.text()).toBe(200);
  const prepaidAfterChange=(await call("ccp_v1_credits_packages_list",{
    studentId:profileId,
  })).structuredContent.data.packages;
  expect(prepaidAfterChange.find((x:{id:string})=>x.id===prepaidId).expiresOn)
    .toBe("2027-04-30");
  const nonExistentRedemption=(await call("ccp_v1_credits_redemption_return",{
    redemptionId:randomUUID(),confirmed:true,
  })).structuredContent;
  expect(nonExistentRedemption.error.code).toBe("NOT_FOUND");

  // Manual payments are real-world receipts, not a request to charge a card.
  for(const name of ["ccp_v1_billing_manual_payment_record","ccp_v1_billing_manual_payment_delete"])
    expect(names).toContain(name);
  const manualKey=randomUUID();
  const manualArgs={invoiceId:acctInvoice!.id,amountCents:1200,
    note:"Cash received at chess class",idempotencyKey:manualKey,confirmed:true};
  const manualWrite=(await call("ccp_v1_billing_manual_payment_record",manualArgs)).structuredContent;
  expect(manualWrite.error).toBeUndefined();
  expect(manualWrite.data.amountCents).toBe(1200);
  const manualPaymentId=manualWrite.data.paymentId as string;
  const manualFromSite=await page.request.get("/api/billing/invoices/"+acctInvoice!.id);
  expect(manualFromSite.status(),await manualFromSite.text()).toBe(200);
  expect((await manualFromSite.json()).payments.some((x:{id:string})=>x.id===manualPaymentId)).toBe(true);
  const manualReplay=(await call("ccp_v1_billing_manual_payment_record",manualArgs)).structuredContent;
  expect(manualReplay.error).toBeUndefined();
  expect(manualReplay.data.replayed).toBe(true);
  expect(manualReplay.data.paymentId).toBe(manualPaymentId);
  const manualConflict=(await call("ccp_v1_billing_manual_payment_record",{
    ...manualArgs,amountCents:1500,
  })).structuredContent;
  expect(manualConflict.error.code).toBe("IDEMPOTENCY_CONFLICT");
  const manualRemoved=await page.request.delete(
    "/api/billing/invoices/"+acctInvoice!.id+"/payments/"+manualPaymentId);
  expect(manualRemoved.status(),await manualRemoved.text()).toBe(200);
  const manualAfterDelete=await page.request.get("/api/billing/invoices/"+acctInvoice!.id);
  expect((await manualAfterDelete.json()).payments.some((x:{id:string})=>x.id===manualPaymentId)).toBe(false);

  // Backup/restore parity: the AI-visible export intentionally omits portal
  // tokens, whereas the authenticated website download is a full backup.
  for(const name of ["ccp_v1_settings_export","ccp_v1_settings_import_preview",
    "ccp_v1_settings_import_apply"])expect(names).toContain(name);
  const webBackup=await page.request.get("/api/settings/export");
  expect(webBackup.status(),await webBackup.text()).toBe(200);
  const websiteBackup=await webBackup.json();
  const transferExport=(await call("ccp_v1_settings_export",{confirmed:true})).structuredContent;
  expect(transferExport.error).toBeUndefined();
  expect(transferExport.data.guardianPortalLinksExcluded).toBe(true);
  const safeBackup=transferExport.data.export;
  expect(safeBackup.version).toBe(websiteBackup.version);
  expect(safeBackup.tables.students.length).toBe(websiteBackup.tables.students.length);
  expect(safeBackup.tables.guardians.every((g:{portal_token?:string})=>g.portal_token===undefined)).toBe(true);
  const importedId=randomUUID();
  const importPayload={
    version:1,exportedAt:"2026-11-08T00:00:00.000Z",teacherId:session!.user.id,
    tables:{students:[{id:importedId,name:"Imported synthetic chess student "+suffix}]},
  };
  const importPreview=(await call("ccp_v1_settings_import_preview",{
    payload:importPayload,
  })).structuredContent;
  expect(importPreview.error).toBeUndefined();
  expect(importPreview.data.counts.students).toBe(1);
  const badDigest=(await call("ccp_v1_settings_import_apply",{
    payload:importPayload,expectedSha256:"0".repeat(64),confirmed:true,
  })).structuredContent;
  expect(badDigest.error.code).toBe("PREVIEW_CHANGED");
  const imported=(await call("ccp_v1_settings_import_apply",{
    payload:importPayload,expectedSha256:importPreview.data.sha256,confirmed:true,
  })).structuredContent;
  expect(imported.error).toBeUndefined();
  expect(imported.data.counts.students).toBe(1);
  const importedFromSite=await page.request.get("/api/students/"+importedId);
  expect(importedFromSite.status(),await importedFromSite.text()).toBe(200);
  expect((await importedFromSite.json()).name).toBe("Imported synthetic chess student "+suffix);

  // The same spreadsheet mapping/preview and scoped import are available via
  // website multipart upload and delegated MCP JSON/base64 workflow.
  for(const name of ["ccp_v1_import_spreadsheet_parse",
    "ccp_v1_import_spreadsheet_preview","ccp_v1_import_spreadsheet_suggest",
    "ccp_v1_import_spreadsheet_commit"])expect(names).toContain(name);
  const csvStudent="Imported CSV chess student "+suffix;
  const csvText=["Student Name,Guardian Name,Email",
    csvStudent+",Chess parent "+suffix+",csv-"+suffix+"@example.com"].join("\n")+"\n";
  const parsedFile=(await call("ccp_v1_import_spreadsheet_parse",{
    filename:"chess-students.csv",base64:Buffer.from(csvText).toString("base64"),
  })).structuredContent;
  expect(parsedFile.error).toBeUndefined();
  expect(parsedFile.data.previewTotal).toBe(1);
  const browserParse=await page.request.post("/api/import/spreadsheet/parse",{
    multipart:{file:{name:"chess-students.csv",mimeType:"text/csv",buffer:Buffer.from(csvText)}},
  });
  expect(browserParse.status(),await browserParse.text()).toBe(200);
  const browserParsed=await browserParse.json();
  expect(parsedFile.data.rows).toEqual(browserParsed.rows);
  expect(parsedFile.data.mapping).toEqual(browserParsed.mapping);
  const remapped=(await call("ccp_v1_import_spreadsheet_preview",{
    rows:parsedFile.data.rows,mapping:parsedFile.data.mapping,
  })).structuredContent;
  expect(remapped.error).toBeUndefined();
  const webRemapped=await page.request.put("/api/import/spreadsheet/parse",{
    data:{rows:parsedFile.data.rows,mapping:parsedFile.data.mapping},
  });
  expect(webRemapped.status(),await webRemapped.text()).toBe(200);
  expect(remapped.data).toEqual(await webRemapped.json());
  const mapped=(await call("ccp_v1_import_spreadsheet_suggest",{
    headers:parsedFile.data.headers,useAi:false,
  })).structuredContent;
  expect(mapped.error).toBeUndefined();
  expect(mapped.data.mapping.student_name).toBe("Student Name");
  const csvCommitted=(await call("ccp_v1_import_spreadsheet_commit",{
    rows:parsedFile.data.rows,mapping:parsedFile.data.mapping,confirmed:true,
  })).structuredContent;
  expect(csvCommitted.error).toBeUndefined();
  expect(csvCommitted.data.studentsCreated).toBe(1);
  const importedRoster=await page.request.get("/api/students?query="+encodeURIComponent(csvStudent));
  expect(importedRoster.status(),await importedRoster.text()).toBe(200);
  expect((await importedRoster.json()).students.some((s:{name:string})=>s.name===csvStudent)).toBe(true);

  // Last five teacher-business route families: invoice generation, refresh,
  // PDF, Stripe-link guard and bulk invoice actions use the same domain service.
  for(const toolName of [
    "ccp_v1_billing_generation_preview","ccp_v1_billing_generation_commit",
    "ccp_v1_billing_invoice_regenerate","ccp_v1_billing_invoice_pdf",
    "ccp_v1_billing_invoice_checkout","ccp_v1_billing_invoices_bulk",
  ])expect(names).toContain(toolName);
  const generationLesson=(await call("ccp_v1_calendar_lessons_create",{
    studentId:profileId,date:"2027-08-18",time:"16:00",durationMinutes:50,
    confirmed:true,
  })).structuredContent;
  expect(generationLesson.error).toBeUndefined();
  const generationLessonId=generationLesson.data.id as string;
  const genAttendance=(await call("ccp_v1_calendar_attendance_record",{
    lessonId:generationLessonId,status:"attended",confirmed:true,
    notifyFamily:false,
  })).structuredContent;
  expect(genAttendance.error).toBeUndefined();
  const configuredGenRate=(await call("ccp_v1_studio_policy_update",{
    changes:{defaultRateCents:4000},confirmed:true,
  })).structuredContent;
  expect(configuredGenRate.error).toBeUndefined();
  const generationDates={periodStart:"2027-08-01",periodEnd:"2027-08-31"};
  const generationWeb=await page.request.post("/api/billing/generate",{
    data:generationDates,
  });
  expect(generationWeb.status(),await generationWeb.text()).toBe(200);
  const generationMcp=(await call("ccp_v1_billing_generation_preview",
    generationDates)).structuredContent;
  expect(generationMcp.error).toBeUndefined();
  expect(generationMcp.data.totalCents).toBe((await generationWeb.json()).totalCents);
  expect(generationMcp.data.totalFamilies).toBe(1);
  const generated=(await call("ccp_v1_billing_generation_commit",{
    ...generationDates,confirmed:true,
  })).structuredContent;
  expect(generated.error).toBeUndefined();
  expect(generated.data.count).toBe(1);
  const generatedId=generated.data.created[0] as string;
  const generatedSite=await page.request.get("/api/billing/invoices/"+generatedId);
  expect(generatedSite.status(),await generatedSite.text()).toBe(200);
  expect((await generatedSite.json()).invoice_items).toHaveLength(1);
  const regenSite=await page.request.post("/api/billing/invoices/"+generatedId+"/regenerate");
  expect(regenSite.status(),await regenSite.text()).toBe(200);
  const afterRegen=await page.request.get("/api/billing/invoices/"+generatedId);
  expect((await afterRegen.json()).subtotal_cents).toBe((await regenSite.json()).subtotalCents);
  const regenMcp=(await call("ccp_v1_billing_invoice_regenerate",{
    invoiceId:generatedId,confirmed:true,
  })).structuredContent;
  expect(regenMcp.error).toBeUndefined();
  expect(regenMcp.data.ok).toBe(true);
  const invoicePdf=(await call("ccp_v1_billing_invoice_pdf",{
    invoiceId:generatedId,confirmed:true,
  })).structuredContent;
  expect(invoicePdf.error).toBeUndefined();
  expect(invoicePdf.data.mimeType).toBe("application/pdf");
  expect(Buffer.from(invoicePdf.data.base64,"base64").subarray(0,4).toString()).toBe("%PDF");
  const invoicePdfWeb=await page.request.get("/api/billing/invoices/"+generatedId+"/pdf");
  expect(invoicePdfWeb.status(),await invoicePdfWeb.text()).toBe(200);
  expect((await invoicePdfWeb.body()).subarray(0,4).toString()).toBe("%PDF");
  const checkoutMcp=(await call("ccp_v1_billing_invoice_checkout",{
    invoiceId:generatedId,confirmed:true,confirmedExternal:true,
  })).structuredContent;
  // Synthetic tenant has no Stripe secret: neither surface may create payment links.
  expect(checkoutMcp.error.code).toBe("VALIDATION_ERROR");
  const checkoutWeb=await page.request.post("/api/billing/invoices/"+generatedId+"/checkout");
  expect(checkoutWeb.status()).toBe(400);
  const duplicateBulk=await page.request.post("/api/billing/invoices/bulk",{
    data:{ids:[generatedId,generatedId],action:"send"},
  });
  expect(duplicateBulk.status()).toBe(400);
  const duplicateMcp=(await call("ccp_v1_billing_invoices_bulk",{
    ids:[generatedId,generatedId],action:"void",confirmed:true,
  })).structuredContent;
  expect(duplicateMcp.error.code).toBe("VALIDATION_ERROR");
  const bulkVoid=(await call("ccp_v1_billing_invoices_bulk",{
    ids:[generatedId],action:"void",confirmed:true,
  })).structuredContent;
  expect(bulkVoid.error).toBeUndefined();
  expect(bulkVoid.data.succeeded).toBe(1);
  const voidedSite=await page.request.get("/api/billing/invoices/"+generatedId);
  expect((await voidedSite.json()).status).toBe("void");
  const deletedSite=await page.request.post("/api/billing/invoices/bulk",{
    data:{action:"delete",ids:[generatedId]},
  });
  expect(deletedSite.status(),await deletedSite.text()).toBe(200);
  expect((await deletedSite.json()).succeeded).toBe(1);
  const missingGenerated=(await call("ccp_v1_billing_invoice_detail",{
    invoiceId:generatedId,
  })).structuredContent;
  expect(missingGenerated.error.code).toBe("NOT_FOUND");

  // Legacy /api/agent/v1 website learning actions now have matching
  // delegated MCP category/observation/resource correction and approval.
  for(const toolName of ["ccp_v1_chess_categories_create",
    "ccp_v1_chess_categories_update","ccp_v1_chess_observations_update",
    "ccp_v1_chess_resources_update"])
    expect(names).toContain(toolName);
  const madeCategory=(await call("ccp_v1_chess_categories_create",{
    name:"Chess endgames "+suffix,description:"Synthetic tests",
    sortOrder:200,confirmed:true,
  })).structuredContent;
  expect(madeCategory.error).toBeUndefined();
  const learningCategoryId=madeCategory.data.id as string;
  const fromWebCategories=await page.request.post("/api/agent/v1",{
    data:{action:"chess.categories.list"},
  });
  expect(fromWebCategories.status(),await fromWebCategories.text()).toBe(200);
  expect((await fromWebCategories.json()).data.some(
    (x:{id:string})=>x.id===learningCategoryId)).toBe(true);
  const categoryEdited=await page.request.post("/api/agent/v1",{
    data:{action:"chess.categories.update",categoryId:learningCategoryId,
      name:"King and pawn endgames "+suffix},
  });
  expect(categoryEdited.status(),await categoryEdited.text()).toBe(200);
  const fromMcpCategories=(await call("ccp_v1_chess_categories_list",{}))
    .structuredContent.data;
  expect(fromMcpCategories.find((x:{id:string})=>x.id===learningCategoryId).name)
    .toBe("King and pawn endgames "+suffix);
  const proposedLearning=(await call("ccp_v1_chess_observations_propose",{
    studentId:profileId,categoryId:learningCategoryId,
    observation:"Student understands the key squares",requestId:randomUUID(),
  })).structuredContent;
  expect(proposedLearning.error).toBeUndefined();
  const observationId=proposedLearning.data.id as string;
  const correctedLearning=(await call("ccp_v1_chess_observations_update",{
    observationId,observation:"Student understands opposition and key squares",
    confirmed:true,
  })).structuredContent;
  expect(correctedLearning.error).toBeUndefined();
  const observationFromWeb=await page.request.post("/api/agent/v1",{
    data:{action:"chess.observations.list",studentId:profileId},
  });
  expect(observationFromWeb.status(),await observationFromWeb.text()).toBe(200);
  expect((await observationFromWeb.json()).data.find(
    (x:{id:string})=>x.id===observationId).observation)
    .toBe("Student understands opposition and key squares");
  const approvedInBrowser=await page.request.post("/api/agent/v1",{
    data:{action:"chess.observations.approve",observationId},
  });
  expect(approvedInBrowser.status(),await approvedInBrowser.text()).toBe(200);
  expect((await approvedInBrowser.json()).data.verified_at).toBeTruthy();
  const approvedReadMcp=(await call("ccp_v1_chess_observations_list",{
    studentId:profileId,
  })).structuredContent.data;
  expect(approvedReadMcp.find((x:{id:string})=>x.id===observationId).verified_at).toBeTruthy();
  const afterApprovalSite=await page.request.post("/api/agent/v1",{
    data:{action:"chess.observations.list",studentId:profileId},
  });
  expect((await afterApprovalSite.json()).data.find(
    (x:{id:string})=>x.id===observationId).verified_at).toBeTruthy();
  const linkCreated=(await call("ccp_v1_chess_resources_link",{
    studentId:profileId,label:"Synthetic Lichess study",
    url:"https://lichess.org/study/abcdefgh",
    resourceType:"lichess_study",requestId:randomUUID(),
  })).structuredContent;
  expect(linkCreated.error).toBeUndefined();
  const resourceId=linkCreated.data.id as string;
  const linkEdited=await page.request.post("/api/agent/v1",{
    data:{action:"chess.resources.update",resourceId,label:"Updated Lichess study"},
  });
  expect(linkEdited.status(),await linkEdited.text()).toBe(200);
  const resourceRead=(await call("ccp_v1_chess_resources_list",{
    studentId:profileId,
  })).structuredContent.data;
  expect(resourceRead.find((x:{id:string})=>x.id===resourceId).label)
    .toBe("Updated Lichess study");

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
  // Both surfaces use the same teacher-scoped, secret-free grant service.
  expect(names).toContain("ccp_v1_connections_list");
  expect(names).toContain("ccp_v1_connections_revoke");
  expect(roNames).toContain("ccp_v1_connections_list");
  expect(roNames).not.toContain("ccp_v1_connections_revoke");
  const connectedByMcp=(await call("ccp_v1_connections_list",{})).structuredContent.data.connections;
  expect(connectedByMcp.map((x:{id:string})=>x.id).sort())
    .toEqual(grants.map(x=>x.id).sort());
  expect(connectedByMcp.every((x:{access_token?:string;refresh_token?:string})=>
    x.access_token===undefined&&x.refresh_token===undefined)).toBe(true);
  const readOnlyGrant=grants.find(x=>x.client_id===roClientId);
  expect(readOnlyGrant).toBeTruthy();
  const revokedViaMcp=(await call("ccp_v1_connections_revoke",{
    connectionId:readOnlyGrant!.id,confirmed:true,
  })).structuredContent;
  expect(revokedViaMcp.error).toBeUndefined();
  const disabledReadOnly=await request.post("/mcp",{
    headers:{Authorization:"Bearer "+roToken},
    data:{jsonrpc:"2.0",id:randomUUID(),method:"tools/list"},
  });
  expect(disabledReadOnly.status()).toBe(401);

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
