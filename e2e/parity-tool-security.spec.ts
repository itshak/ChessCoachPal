import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-security-no-raw-tools blocks SQL/secret fetch and keeps default guardian results private",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const email="private-"+randomUUID()+"@example.com";
 const created=await call("ccp_v1_guardians_create",{
   name:"Sensitive family "+randomUUID(),email,confirmed:true,
 });
 expect(created.error).toBeUndefined();
 expect(created.data.email).toBeUndefined();
 expect(created.data.portal_token).toBeUndefined();
 const guardianId=created.data.id as string;
 const full=await page.request.get("/api/guardians/"+guardianId);
 expect(full.status(),await full.text()).toBe(200);
 const site=await full.json();
 expect(site.email).toBe(email);
 expect(site.portal_token).toBeTruthy();
 const safe=await call("ccp_v1_guardians_detail",{guardianId});
 expect(safe.error).toBeUndefined();
 expect(safe.data.email).toBeUndefined();
 expect(safe.data.portal_token).toBeUndefined();
 const confirmed=await call("ccp_v1_guardians_detail",{
   guardianId,includeContacts:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.email).toBe(email);
 expect(confirmed.data.portal_token).toBeUndefined();
 const rawSql=await call("ccp_v1_sql_execute",{sql:"select * from auth.users"});
 expect(rawSql.error?.code).toBe("NOT_FOUND");
 const secretFetch=await call("ccp_v1_secrets_fetch",{name:"SUPABASE_SERVICE_ROLE_KEY"});
 expect(secretFetch.error?.code).toBe("NOT_FOUND");
 const policy=await call("ccp_v1_studio_policy_get",{});
 expect(policy.error).toBeUndefined();
 expect(policy.data.ai_api_key).toBeNull();
 expect(policy.data.stripe_secret_key).toBeNull();
 const webPolicy=await page.request.get("/api/settings/policy");
 expect(webPolicy.status()).toBe(200);
 expect((await webPolicy.json()).ai_api_key).toBeNull();
});
