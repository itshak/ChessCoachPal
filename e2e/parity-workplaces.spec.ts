import { createHash, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signInAsTeacher } from "./helpers/auth";

/**
 * Each named scenario independently authenticates a browser and delegates a
 * real OAuth PKCE MCP client. These are individual acceptance evidence tests,
 * not synthetic list-of-tool-name assertions.
 */
async function delegatedTool(page: Page, request: APIRequestContext) {
  const origin = "http://localhost:3000";
  const callback = origin + "/oauth/synthetic-callback";
  const verifier = "p".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const registration = await request.post("/oauth/register", {data:{
    client_name:"Parity scenario "+randomUUID(),redirect_uris:[callback],
    token_endpoint_auth_method:"none",
  }});
  expect(registration.status(),await registration.text()).toBe(201);
  const clientId = (await registration.json()).client_id as string;
  await signInAsTeacher(page);
  const qs = new URLSearchParams({
    client_id:clientId,redirect_uri:callback,response_type:"code",
    resource:origin+"/mcp",code_challenge_method:"S256",code_challenge:challenge,
    state:"parity-"+randomUUID(),scope:"coach:read coach:write",
  });
  await page.goto("/oauth/authorize?"+qs.toString());
  await page.getByRole("button",{name:"Authorize"}).click();
  await page.waitForURL(u=>u.pathname==="/oauth/synthetic-callback" && u.searchParams.has("code"),
    {waitUntil:"commit",timeout:20000});
  const authCode=new URL(page.url()).searchParams.get("code");
  expect(authCode).toBeTruthy();
  const exchange=await request.post("/oauth/token",{form:{
    grant_type:"authorization_code",client_id:clientId,redirect_uri:callback,
    code:authCode!,code_verifier:verifier,resource:origin+"/mcp",
  }});
  expect(exchange.status(),await exchange.text()).toBe(200);
  const token=(await exchange.json()).access_token as string;
  return async (name:string,args:Record<string,unknown>)=>{
    const reply=await request.post("/mcp",{headers:{
      Authorization:"Bearer "+token,"MCP-Protocol-Version":"2025-06-18",
    },data:{jsonrpc:"2.0",id:randomUUID(),method:"tools/call",
      params:{name,arguments:args}}});
    expect(reply.status(),await reply.text()).toBe(200);
    return (await reply.json()).result.structuredContent as
      {data?:unknown;error?:{code:string;message:string}};
  };
}

test("PARITY:PARITY-workplaces-list lists owned workplace details without foreign disclosure", async ({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const website=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
  expect(website.status(),await website.text()).toBe(200);
  const browserRows=(await website.json()).data as Array<{
    id:string;name:string;timezone:string;currency:string;locale:string;policy:unknown;
  }>;
  const mcpRows=(await callTool("ccp_v1_workplaces_list",{})).data;
  expect(mcpRows).toEqual(browserRows);
  expect(browserRows.length).toBeGreaterThan(0);
  for(const row of browserRows){
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.name).toBeTruthy();
    expect(row.timezone).toBeTruthy();
    expect(row.currency).toHaveLength(3);
    expect(row.locale).toBeTruthy();
    expect(row.policy).toBeDefined();
  }

  // A foreign teacher's workplace must not appear in either listing. The
  // explicit details/enrollment lookup must also deny that tenant's UUID.
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const foreignEmail="parity-foreign-"+randomUUID()+"@example.com";
  const {data:foreignUser,error:authError}=await admin.auth.admin.createUser({
    email:foreignEmail,password:"SyntheticPassword-123!",email_confirm:true,
  });
  expect(authError).toBeNull();
  expect(foreignUser.user?.id).toBeTruthy();
  const {error:teacherError}=await admin.from("teachers").insert({
    id:foreignUser.user!.id,email:foreignEmail,display_name:"Foreign parity teacher",
  });
  expect(teacherError).toBeNull();
  const {data:foreignWorkplace,error:foreignError}=await admin.from("workplaces")
    .select("id").eq("teacher_id",foreignUser.user!.id).single();
  expect(foreignError).toBeNull();
  const websiteAgain=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
  expect(websiteAgain.status()).toBe(200);
  expect((await websiteAgain.json()).data.some((r:{id:string})=>r.id===foreignWorkplace!.id)).toBe(false);
  expect(((await callTool("ccp_v1_workplaces_list",{})).data as Array<{id:string}>)
    .some(r=>r.id===foreignWorkplace!.id)).toBe(false);
  const deniedMcp=await callTool("ccp_v1_workplaces_enrollments",{
    workplaceId:foreignWorkplace!.id,
  });
  expect(deniedMcp.error?.code).toBe("NOT_FOUND");
  const deniedBrowser=await page.request.post("/api/agent/v1",{
    data:{action:"workplaces.enrollments",workplaceId:foreignWorkplace!.id},
  });
  expect(deniedBrowser.status()).toBe(404);
  const {error:cleanupError}=await admin.auth.admin.deleteUser(foreignUser.user!.id);
  expect(cleanupError).toBeNull();
});

test("PARITY:PARITY-workplaces-create preserves timezone currency and locale on both clients", async ({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const zone="Asia/Jerusalem", currency="ILS", locale="he";
  const website=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.create",name:"Browser parity "+randomUUID(),
    timezone:zone,currency,locale,policy:{},
  }});
  expect(website.status(),await website.text()).toBe(200);
  const siteRow=(await website.json()).data as {id:string;timezone:string;currency:string;locale:string};
  const receipt=await callTool("ccp_v1_workplaces_create",{
    name:"MCP parity "+randomUUID(),timezone:zone,currency,locale,policy:{},
    idempotencyKey:randomUUID(),
  });
  expect(receipt.error).toBeUndefined();
  const toolId=(receipt.data as {entityId:string}).entityId;
  const siteList=await page.request.post("/api/agent/v1",{data:{action:"workplaces.list"}});
  expect(siteList.status()).toBe(200);
  const byId=new Map(((await siteList.json()).data as Array<{
    id:string;timezone:string;currency:string;locale:string;
  }>).map(w=>[w.id,w]));
  const toolList=(await callTool("ccp_v1_workplaces_list",{})).data as Array<{
    id:string;timezone:string;currency:string;locale:string;
  }>;
  expect(toolList).toEqual([...byId.values()]);
  for(const id of [siteRow.id,toolId]){
    const row=byId.get(id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({timezone:zone,currency,locale});
  }
  const invalidWebsite=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.create",name:"Bad zone "+randomUUID(),
    timezone:"Etc/Definitely_Invalid",currency,locale,policy:{},
  }});
  expect(invalidWebsite.status()).toBe(400);
  const invalidMcp=await callTool("ccp_v1_workplaces_create",{
    name:"Bad MCP zone",timezone:"Etc/Definitely_Invalid",currency,locale,policy:{},
    idempotencyKey:randomUUID(),
  });
  expect(invalidMcp.error).toBeDefined();
});

test("PARITY:PARITY-workplaces-enroll records only owned students through both surfaces", async ({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const workplace=(await callTool("ccp_v1_workplaces_create",{
    name:"Enroll parity "+randomUUID(),timezone:"UTC",currency:"USD",
    locale:"en",policy:{},idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  expect(workplace.entityId).toBeTruthy();
  const first=(await callTool("ccp_v1_students_create",{
    name:"MCP member "+randomUUID(),idempotencyKey:randomUUID(),
  })).data as {entityId:string};
  expect(first.entityId).toBeTruthy();
  const toolEnrollment=await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:workplace.entityId,studentId:first.entityId,idempotencyKey:randomUUID(),
  });
  expect(toolEnrollment.error).toBeUndefined();
  const websiteStudent=await page.request.post("/api/agent/v1",{data:{
    action:"students.create",name:"Browser member "+randomUUID(),
  }});
  expect(websiteStudent.status()).toBe(200);
  const secondId=(await websiteStudent.json()).data.id as string;
  const websiteEnrollment=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enroll",workplaceId:workplace.entityId,studentId:secondId,
  }});
  expect(websiteEnrollment.status(),await websiteEnrollment.text()).toBe(200);
  const websiteMembers=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enrollments",workplaceId:workplace.entityId,
  }});
  expect(websiteMembers.status()).toBe(200);
  const members=(await websiteMembers.json()).data as Array<{student_id:string}>;
  expect(members.some(m=>m.student_id===first.entityId)).toBe(true);
  expect(members.some(m=>m.student_id===secondId)).toBe(true);
  expect((await callTool("ccp_v1_workplaces_enrollments",{
    workplaceId:workplace.entityId,
  })).data).toEqual(members);

  // Foreign tenant student IDs must be denied, not auto-enrolled.
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const email="foreign-enroll-"+randomUUID()+"@example.com";
  const {data:other,error:userError}=await admin.auth.admin.createUser({
    email,password:"SyntheticPassword-123!",email_confirm:true,
  });
  expect(userError).toBeNull();
  const {error:teacherError}=await admin.from("teachers").insert({
    id:other.user!.id,email,display_name:"Other teacher",
  });
  expect(teacherError).toBeNull();
  const {data:foreign,error:foreignError}=await admin.from("students").insert({
    teacher_id:other.user!.id,name:"Foreign member "+randomUUID(),
  }).select("id").single();
  expect(foreignError).toBeNull();
  const deniedMcp=await callTool("ccp_v1_workplaces_enroll",{
    workplaceId:workplace.entityId,studentId:foreign!.id,idempotencyKey:randomUUID(),
  });
  expect(deniedMcp.error?.code).toBe("NOT_FOUND");
  const deniedSite=await page.request.post("/api/agent/v1",{data:{
    action:"workplaces.enroll",workplaceId:workplace.entityId,studentId:foreign!.id,
  }});
  expect(deniedSite.status()).toBe(404);
  expect((await callTool("ccp_v1_workplaces_enrollments",{
    workplaceId:workplace.entityId,
  })).data).toEqual(members);
  const {error:cleanupError}=await admin.auth.admin.deleteUser(other.user!.id);
  expect(cleanupError).toBeNull();
});
