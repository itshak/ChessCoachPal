import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-optional-ai-settings masks browser-entered key and permits confirmed MCP clearing",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const before=await page.request.get("/api/settings/policy");
 expect(before.status(),await before.text()).toBe(200);
 const original=await before.json();
 const secret="synthetic-ai-key-"+randomUUID();
 try{
   const set=await page.request.put("/api/settings/policy",{data:{
     aiProvider:"openai",aiApiKey:secret,
   }});
   expect(set.status(),await set.text()).toBe(200);
   const website=await set.json();
   expect(website.ai_provider).toBe("openai");
   expect(website.ai_api_key).toBeNull();
   expect(website.ai.apiKey.configured).toBe(true);
   expect(JSON.stringify(website)).not.toContain(secret);
   const model=await call("ccp_v1_studio_policy_get",{});
   expect(model.error).toBeUndefined();
   expect(model.data.ai_provider).toBe("openai");
   expect(model.data.ai_api_key).toBeNull();
   expect(model.data.ai.apiKey.configured).toBe(true);
   expect(JSON.stringify(model.data)).not.toContain(secret);
   const rejected=await call("ccp_v1_studio_policy_update",{
     changes:{aiApiKey:"model-cannot-write-secrets"},confirmed:true,
   });
   expect(rejected.error?.code).toBe("VALIDATION_ERROR");
   const cleared=await call("ccp_v1_studio_policy_update",{
     changes:{aiProvider:"none",clearAiApiKey:true},confirmed:true,
   });
   expect(cleared.error).toBeUndefined();
   const browserAfter=await page.request.get("/api/settings/policy");
   expect(browserAfter.status()).toBe(200);
   const after=await browserAfter.json();
   expect(after.ai_provider).toBe("none");
   expect(after.ai.apiKey.configured).toBe(false);
   expect(after.ai_api_key).toBeNull();
 }finally{
   const restored=await page.request.put("/api/settings/policy",{data:{
     aiProvider:original.ai_provider,
     ...(original.ai?.apiKey?.configured?{}:{clearAiApiKey:true}),
   }});
   expect(restored.status(),await restored.text()).toBe(200);
 }
});
