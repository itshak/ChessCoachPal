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
  const workplace=await postDomain({action:"workplaces.create",name:"Agent test "+suffix,timezone:"UTC"});
  const student=await postDomain({action:"students.create",name:"Agent synthetic learner "+suffix});
  const group=await postDomain({action:"groups.create",workplaceId:workplace.id,name:"Class "+suffix});
  await postDomain({action:"groups.enroll",groupId:group.id,studentId:student.id});
  const sessionRecord=await postDomain({action:"sessions.create",requestId:randomUUID(),
    workplaceId:workplace.id,groupId:group.id,title:"Agent lesson "+suffix,
    startsAt:"2027-04-12T14:00:00.000Z",durationMinutes:60,lessonNote:"Original"});
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

  const connections=await page.request.get("/api/agent/connections");
  expect(connections.status()).toBe(200);
  const grants=(await connections.json()).connections as {id:string;client_id:string}[];
  const grant=grants.find(g=>g.client_id===clientId);
  expect(grant).toBeTruthy();
  const revoke=await page.request.delete("/api/agent/connections",{
    headers:{Origin:origin},data:{id:grant!.id},
  });
  expect(revoke.status(),await revoke.text()).toBe(200);
  const blocked=await request.post("/mcp",{
    headers:{Authorization:"Bearer "+token.access_token},
    data:{jsonrpc:"2.0",id:9,method:"tools/list"},
  });
  expect(blocked.status()).toBe(401);
});
