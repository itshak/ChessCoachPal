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


test("PARITY:PARITY-studio-payment-qr-provider-fields makes every approved payment setting editable in both clients",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const originalRes=await page.request.get("/api/settings/policy");
 expect(originalRes.status(),await originalRes.text()).toBe(200);
 const original=await originalRes.json();
 const qr="data:image/png;base64,"+
   "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+p+6UAAAAASUVORK5CYII=";
 try{
   const changed=await call("ccp_v1_studio_policy_update",{
     changes:{paymentProvider:"manual",paymentQrCode:qr},confirmed:true,
   });
   expect(changed.error).toBeUndefined();
   const browser=await page.request.get("/api/settings/policy");
   expect(browser.status(),await browser.text()).toBe(200);
   const webPolicy=await browser.json();
   expect(webPolicy.payment_provider).toBe("manual");
   expect(webPolicy.payment_qr_code).toBe(qr);

   const ordinary=await call("ccp_v1_studio_policy_get",{});
   expect(ordinary.error).toBeUndefined();
   expect(ordinary.data.payment_qr_code).toBeNull();
   expect(ordinary.data.paymentQrCodeConfigured).toBe(true);
   const noConsent=await call("ccp_v1_studio_policy_get",{
     includePaymentQrCode:true,
   });
   expect(noConsent.error).toBeUndefined();
   expect(noConsent.data.payment_qr_code).toBeNull();
   const approved=await call("ccp_v1_studio_policy_get",{
     includePaymentQrCode:true,confirmed:true,
   });
   expect(approved.error).toBeUndefined();
   expect(approved.data.payment_qr_code).toBe(qr);

   const rejectSecrets=await call("ccp_v1_studio_policy_update",{
     changes:{stripeSecretKey:"sk_live_must_not_enter_model"},confirmed:true,
   });
   expect(rejectSecrets.error?.code).toBe("VALIDATION_ERROR");
   const cleared=await page.request.put("/api/settings/policy",{data:{
     paymentQrCode:null,
   }});
   expect(cleared.status(),await cleared.text()).toBe(200);
   const modelFinal=await call("ccp_v1_studio_policy_get",{});
   expect(modelFinal.error).toBeUndefined();
   expect(modelFinal.data.paymentQrCodeConfigured).toBe(false);
 }finally{
   const restore=await page.request.put("/api/settings/policy",{data:{
     paymentProvider:original.payment_provider,
     paymentQrCode:original.payment_qr_code??null,
   }});
   expect(restore.status(),await restore.text()).toBe(200);
 }
});


test("PARITY:PARITY-policy-invalid-field-validation rejects coercion equally on both surfaces without persistence",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const before=await page.request.get("/api/settings/policy");
 expect(before.status(),await before.text()).toBe(200);
 const original=await before.json();
 for(const changes of [
   {notifyInApp:"false"},
   {billAttended:"false"},
   {defaultRateCents:2.5},
   {travelFeeCents:-300},
   {durationRateCents:{"45":2.5}},
   {makeupCreditExpiryDays:2.5},
 ]){
   const browser=await page.request.put("/api/settings/policy",{data:changes});
   expect(browser.status(),await browser.text()).toBe(400);
   const mcp=await call("ccp_v1_studio_policy_update",{changes,confirmed:true});
   expect(mcp.error?.code).toBe("VALIDATION_ERROR");
 }
 const after=await page.request.get("/api/settings/policy");
 expect(after.status(),await after.text()).toBe(200);
 const final=await after.json();
 for(const field of ["default_rate_cents","travel_fee_cents",
   "notify_in_app","bill_attended","makeup_credit_expiry_days"])
   expect(final[field]).toEqual(original[field]);
});
