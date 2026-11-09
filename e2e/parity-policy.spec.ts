import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-studio-policy covers timezone scheduling rates invoices and notifications on both clients",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const first=await page.request.get("/api/settings/policy");
 expect(first.status(),await first.text()).toBe(200);
 const original=await first.json() as Record<string,any>;
 const mcpOriginal=await call("ccp_v1_studio_policy_get",{});
 expect(mcpOriginal.error).toBeUndefined();
 expect(mcpOriginal.data.timezone).toBe(original.timezone);
 expect(mcpOriginal.data.ai_api_key).toBeNull();
 expect(mcpOriginal.data.stripe_secret_key).toBeNull();
 const changes={
   studioName:"Parity chess academy "+randomUUID().slice(0,9),
   timezone:"Asia/Jerusalem",cancellationWindowHours:13,
   defaultRateCents:5400,invoiceCadence:"manual",notifyInApp:false,
 };
 try{
   const updated=await call("ccp_v1_studio_policy_update",{
     changes,confirmed:true,
   });
   expect(updated.error).toBeUndefined();
   const website=await page.request.get("/api/settings/policy");
   expect(website.status(),await website.text()).toBe(200);
   const view=await website.json();
   expect(view).toMatchObject({
     studio_name:changes.studioName,timezone:changes.timezone,
     cancellation_window_hours:13,default_rate_cents:5400,
     invoice_cadence:"manual",notify_in_app:false,
   });
   const browserEdit=await page.request.put("/api/settings/policy",{data:{
     defaultRateCents:5800,notifyInApp:true,
   }});
   expect(browserEdit.status(),await browserEdit.text()).toBe(200);
   const mcpFinal=await call("ccp_v1_studio_policy_get",{});
   expect(mcpFinal.error).toBeUndefined();
   expect(mcpFinal.data.default_rate_cents).toBe(5800);
   expect(mcpFinal.data.notify_in_app).toBe(true);
 }finally{
   const restore=await page.request.put("/api/settings/policy",{data:{
     studioName:original.studio_name,
     timezone:original.timezone,
     cancellationWindowHours:original.cancellation_window_hours,
     defaultRateCents:original.default_rate_cents,
     invoiceCadence:original.invoice_cadence,
     notifyInApp:original.notify_in_app,
   }});
   expect(restore.status(),await restore.text()).toBe(200);
 }
});
