import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-security-no-raw-tools blocks SQL/secret fetch and keeps default contact results private",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const email="private-"+randomUUID()+"@example.com";
 const created=await call("ccp_contacts_create",{
   displayName:"Sensitive contact "+randomUUID(),email,
   idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(created.error).toBeUndefined();
 expect(created.data.email).toBeUndefined();
 expect(created.data.token_digest).toBeUndefined();
 const contactId=created.data.id as string;
 const full=await page.request.get("/api/contacts/"+contactId);
 expect(full.status(),await full.text()).toBe(200);
 const site=await full.json();
 expect(site.email).toBe(email);
 expect(JSON.stringify(site)).not.toContain("token_digest");
 const safe=await call("ccp_contacts_detail",{contactId});
 expect(safe.error).toBeUndefined();
 expect(safe.data.email).toBeUndefined();
 const confirmed=await call("ccp_contacts_detail",{
   contactId,includeDetails:true,confirmed:true,
 });
 expect(confirmed.error).toBeUndefined();
 expect(confirmed.data.email).toBe(email);
 expect(JSON.stringify(confirmed.data)).not.toContain("token_digest");
 const rawSql=await call("ccp_sql_execute",{sql:"select * from auth.users"});
 expect(rawSql.error?.code).toBe("NOT_FOUND");
 const secretFetch=await call("ccp_secrets_fetch",{name:"SUPABASE_SERVICE_ROLE_KEY"});
 expect(secretFetch.error?.code).toBe("NOT_FOUND");
 const policy=await call("ccp_teacher_settings_get",{});
 expect(policy.error).toBeUndefined();
 expect(policy.data.ai_api_key).toBeNull();
 expect(policy.data.stripe_secret_key).toBeNull();
 const webPolicy=await page.request.get("/api/settings/policy");
 expect(webPolicy.status()).toBe(200);
 expect((await webPolicy.json()).ai_api_key).toBeNull();
});
