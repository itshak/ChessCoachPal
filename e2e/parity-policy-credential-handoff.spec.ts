import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** Passwords/API keys are never MCP tool arguments. The model can initiate a
 * securely authenticated browser handoff; browser policy submission and MCP
 * configured/masked readback and clearing must still be consistent. */
test("PARITY:PARITY-policy-secret-handoff-website-mcp uses authenticated private entry and model-safe status",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const beforeResponse=await page.request.get("/api/settings/policy");
 expect(beforeResponse.status(),await beforeResponse.text()).toBe(200);
 const original=await beforeResponse.json();
 const noConsent=await call("ccp_v1_studio_credentials_handoff",{kind:"ai"});
 expect(noConsent.error?.code).toBe("VALIDATION_ERROR");
 const ai=await call("ccp_v1_studio_credentials_handoff",{
  kind:"ai",confirmed:true,
 });
 expect(ai.error).toBeUndefined();
 expect(ai.data.setupPath).toBe("/account#optional-ai-credentials");
 expect(new URL(ai.data.setupUrl).pathname).toBe("/account");
 expect(new URL(ai.data.setupUrl).hash).toBe("#optional-ai-credentials");
 expect(ai.data.requiresAuthenticatedBrowser).toBe(true);
 expect(ai.data.credentialValuesIncluded).toBe(false);
 await page.goto(ai.data.setupPath);
 await expect(page.getByRole("heading",{name:"Optional AI"})).toBeVisible();
 const stripe=await call("ccp_v1_studio_credentials_handoff",{
  kind:"stripe",confirmed:true,
 });
 expect(stripe.error).toBeUndefined();
 expect(stripe.data.setupPath).toBe("/billing?paymentSettings=1");
 expect(stripe.data.credentialValuesIncluded).toBe(false);
 await page.goto(stripe.data.setupPath);
 await expect(page.getByRole("dialog",{name:"Payment settings"})).toBeVisible();
 const cannotSendThroughModel=await call("ccp_v1_studio_policy_update",{
  changes:{aiApiKey:"sk_test_never_pass_sensitive_keys_to_model"},
  confirmed:true,
 });
 expect(cannotSendThroughModel.error?.code).toBe("VALIDATION_ERROR");
 // The browser is the ONLY surface allowed to receive the opaque provider key.
 // No live network provider request is made in this test.
 const secret="sk_synthetic_model_never_sees_"+randomUUID().replaceAll("-","");
 try{
  const updated=await page.request.put("/api/settings/policy",{
   data:{aiProvider:"openai",aiApiKey:secret},
  });
  expect(updated.status(),await updated.text()).toBe(200);
  const websiteValue=await updated.json();
  expect(websiteValue.ai.apiKey.configured).toBe(true);
  expect(JSON.stringify(websiteValue)).not.toContain(secret);
  const model=await call("ccp_v1_studio_policy_get",{});
  expect(model.error).toBeUndefined();
  expect(model.data.ai.apiKey.configured).toBe(true);
  expect(model.data.ai_api_key).toBeNull();
  expect(JSON.stringify(model)).not.toContain(secret);
  const updatedHandoff=await call("ccp_v1_studio_credentials_handoff",{
   kind:"ai",confirmed:true,
  });
  expect(updatedHandoff.error).toBeUndefined();
  expect(updatedHandoff.data.configured).toBe(true);
  expect(JSON.stringify(updatedHandoff)).not.toContain(secret);
  const cleared=await call("ccp_v1_studio_policy_update",{
   changes:{aiProvider:"none",clearAiApiKey:true},confirmed:true,
  });
  expect(cleared.error).toBeUndefined();
  const final=await page.request.get("/api/settings/policy");
  expect(final.status(),await final.text()).toBe(200);
  const finalPolicy=await final.json();
  expect(finalPolicy.ai.apiKey.configured).toBe(false);
  expect(finalPolicy.ai_provider).toBe("none");
  expect(JSON.stringify({ai,stripe,model,updatedHandoff,cleared}))
   .not.toContain(secret);
 }finally{
  const restore=await page.request.put("/api/settings/policy",{
   data:{aiProvider:original.ai_provider,clearAiApiKey:true},
  });
  expect(restore.status(),await restore.text()).toBe(200);
 }
});
