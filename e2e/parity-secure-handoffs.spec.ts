import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-account-security-handoff keeps browser reauthentication outside MCP",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const result=await call("ccp_v1_account_security_handoff",{});
 expect(result.error).toBeUndefined();
 const data=result.data as {url:string;browserOnly:boolean;action:string};
 expect(data.browserOnly).toBe(true);
 expect(data.action).toBe("account-security");
 const url=new URL(data.url);
 expect(url.pathname).toBe("/account");
 expect(url.search).toBe("");
 const web=await page.request.get("/account");
 expect(web.status(),await web.text()).toBe(200);
 const raw=JSON.stringify(result.data);
 expect(raw).not.toMatch(/password=|token=|mfa_secret|stripe_secret_key/i);
});
test("PARITY:PARITY-hosted-subscription-handoff opens signed-in account without exposing Stripe credentials",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const result=await call("ccp_v1_hosted_subscription_handoff",{});
 expect(result.error).toBeUndefined();
 const data=result.data as {url:string;browserOnly:boolean;action:string};
 expect(data.browserOnly).toBe(true);
 expect(data.action).toBe("hosted-billing");
 const url=new URL(data.url);
 expect(url.pathname).toBe("/account");
 expect(url.search).toBe("");
 expect((await page.request.get("/account")).status()).toBe(200);
 expect(JSON.stringify(data)).not.toMatch(/checkout\.stripe\.com|sk_(?:test|live)_|client_secret/i);
});
