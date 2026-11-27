import {createHash,randomUUID} from "node:crypto";
import {expect,type APIRequestContext,type Page} from "@playwright/test";
import {signInAsTeacher} from "./auth";

/** A single deliberate dynamic-data boundary for test-only JSON-RPC tool
 * results: each of ~190 tools has a different Zod-shaped result. The website
 * vs MCP parity suites assert the returned shape and values explicitly.
 * Production MCP parsing and validation remain independently typed and strict.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogenous test-only JSON-RPC tool result
export type TestMcpData = any;
export type TestMcpReply = {data?:TestMcpData;error?:{code:string;message:string}};

/**
 * Each named scenario independently authenticates a browser and delegates a
 * real OAuth PKCE MCP client. These are individual acceptance evidence tests,
 * not synthetic list-of-tool-name assertions.
 */
export async function delegatedTool(page: Page, request: APIRequestContext, scope = "coach:read coach:write", credentials?:{email:string;password:string}, consentName?:string) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;
  const callback = origin + "/oauth/synthetic-callback";
  const verifier = "p".repeat(64);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const registration = await request.post("/oauth/register", {data:{
    client_name:"Parity scenario "+randomUUID(),redirect_uris:[callback],
    token_endpoint_auth_method:"none",
  }});
  expect(registration.status(),await registration.text()).toBe(201);
  const clientId = (await registration.json()).client_id as string;
  if(credentials){
    await page.goto("/login");
    await page.locator('form input[type="email"]').fill(credentials.email);
    await page.locator('form input[type="password"]').fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL("**/dashboard",{timeout:20000});
  }else await signInAsTeacher(page);
  const qs = new URLSearchParams({
    client_id:clientId,redirect_uri:callback,response_type:"code",
    resource:origin+"/mcp",code_challenge_method:"S256",code_challenge:challenge,
    state:"parity-"+randomUUID(),scope,
  });
  await page.goto("/oauth/authorize?"+qs.toString());
  if(consentName) await page.getByRole("button",{name:consentName,exact:true}).click({timeout:10000});
  else await page.getByRole("button",{name:"Authorize"}).click();
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
  const invoke=async (name:string,args:Record<string,unknown>)=>{
    const reply=await request.post("/mcp",{headers:{
      Authorization:"Bearer "+token,"MCP-Protocol-Version":"2025-06-18",
    },data:{jsonrpc:"2.0",id:randomUUID(),method:"tools/call",
      params:{name,arguments:args}}});
    expect(reply.status(),await reply.text()).toBe(200);
    return (await reply.json()).result.structuredContent as TestMcpReply;
  };
  // Stable client identity lets acceptance tests target only their own OAuth
  // grant for revocation instead of touching parallel/seeded connections.
  // Scoped OAuth discovery; never expose bearer credentials to test cases.
  // The full live catalogue is checked against the reviewed teacher-route inventory.
  const listTools=async ()=>{
    const reply=await request.post("/mcp",{headers:{
      Authorization:"Bearer "+token,"MCP-Protocol-Version":"2025-06-18",
    },data:{jsonrpc:"2.0",id:randomUUID(),method:"tools/list",params:{}}});
    expect(reply.status(),await reply.text()).toBe(200);
    const result=await reply.json() as {result?:{tools?:Array<{
      name:string;inputSchema?:Record<string,unknown>;
    }>};error?:unknown};
    expect(result.error).toBeUndefined();
    return result.result?.tools??[];
  };
  return Object.assign(invoke,{clientId,listTools});
}

