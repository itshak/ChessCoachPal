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

test("PARITY:PARITY-account-browser-mfa-presence is accessible only through secure signed-in UI",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const redirect=await call("ccp_v1_account_security_handoff",{});
 expect(redirect.error).toBeUndefined();
 await page.goto(new URL(redirect.data.url).pathname);
 await expect(page.getByRole("heading",{name:"Account Settings"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Two-factor authentication"})).toBeVisible();
 const mfaPanel=page.getByRole("region",{name:"Two-factor authentication"});
 await expect(mfaPanel.getByText(/Setup, codes and recovery stay in this secure signed-in browser/i))
   .toBeVisible();
 // Actual authenticator enrollment and factor secret are browser-only actions:
 // there is no MCP TOTP enrollment or code-submission tool to leak the secret.
 expect(redirect.data.url).toBe("http://localhost:3000/account");
 expect(Object.keys(redirect.data).sort()).toEqual(["action","browserOnly","explanation","url"]);
 expect(JSON.stringify({url:redirect.data.url,action:redirect.data.action}))
   .not.toMatch(/totp_secret|mfa_secret|otp_secret|challenge_id|password=|sk_live_/i);
});
