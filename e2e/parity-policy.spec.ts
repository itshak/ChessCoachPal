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

test("PARITY:PARITY-studio-policy-fields-all preserves ordinary profile, rate and nullable clear edits across both clients",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const initial=await page.request.get("/api/settings/policy");
 expect(initial.status(),await initial.text()).toBe(200);
 const original=await initial.json() as Record<string,any>;
 const newWebsite="https://chesscoachpal.example/"+randomUUID().slice(0,8);
 const changes={
  studioWebsite:newWebsite,studioContact:"Academy desk "+randomUUID().slice(0,5),
  studioInfo:"Test coaching studio",lessonLabel:"Chess class",
  lessonDurationOptions:[30,45,60],
  travelFeeCents:2100,rateBasis:"per_hour" as const,
  billNoShow:true,notifyEmailInvoicePaid:false,
  paymentInstructions:"Please use bank transfer",
  bccEmail:"coach-parity@example.org",
 };
 try{
  const updated=await call("ccp_v1_studio_policy_update",{changes,confirmed:true});
  expect(updated.error).toBeUndefined();
  const site=await page.request.get("/api/settings/policy");
  expect(site.status(),await site.text()).toBe(200);
  expect(await site.json()).toMatchObject({
   studio_website:changes.studioWebsite,studio_contact:changes.studioContact,
   studio_info:changes.studioInfo,lesson_label:changes.lessonLabel,
   lesson_duration_options:[30,45,60],
   travel_fee_cents:2100,rate_basis:"per_hour",bill_no_show:true,
   notify_email_invoice_paid:false,payment_instructions:changes.paymentInstructions,
   bcc_email:changes.bccEmail,
  });
  const cleared=await page.request.put("/api/settings/policy",{data:{
   studioWebsite:"https://chesscoachpal.example/edited",
   studioInfo:"Updated by website",travelFeeCents:null,
   defaultRateCents:null,makeupCreditExpiryDays:null,bccEmail:null,
  }});
  expect(cleared.status(),await cleared.text()).toBe(200);
  const read=await call("ccp_v1_studio_policy_get",{});
  expect(read.error).toBeUndefined();
  expect(read.data).toMatchObject({
   studio_website:"https://chesscoachpal.example/edited",
   studio_info:"Updated by website",
   travel_fee_cents:null,default_rate_cents:null,
   makeup_credit_expiry_days:null,bcc_email:null,
  });
  const bad=await call("ccp_v1_studio_policy_update",{
   changes:{stripeSecretKey:"sk_live_secret_must_never_reach_mcp"},
   confirmed:true,
  });
  expect(bad.error?.code).toBe("VALIDATION_ERROR");
 }finally{
  const back=await page.request.put("/api/settings/policy",{data:{
   studioWebsite:original.studio_website??"",
   studioContact:original.studio_contact??"",
   studioInfo:original.studio_info??"",
   lessonLabel:original.lesson_label,
   lessonDurationOptions:original.lesson_duration_options,
   travelFeeCents:original.travel_fee_cents,
   defaultRateCents:original.default_rate_cents,
   makeupCreditExpiryDays:original.makeup_credit_expiry_days,
   rateBasis:original.rate_basis,
   billNoShow:original.bill_no_show,
   notifyEmailInvoicePaid:original.notify_email_invoice_paid,
   paymentInstructions:original.payment_instructions??"",
   bccEmail:original.bcc_email??null,
  }});
  expect(back.status(),await back.text()).toBe(200);
 }
});

test("PARITY:PARITY-studio-policy-ordinary-fields-roundtrip persists every coach-owned setting through either surface",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const current=await page.request.get("/api/settings/policy");
 expect(current.status(),await current.text()).toBe(200);
 const original=await current.json() as Record<string,any>;
 const mapping=[
  ["studioName","studio_name"],["studioWebsite","studio_website"],
  ["studioContact","studio_contact"],["studioInfo","studio_info"],
  ["lessonLabel","lesson_label"],["lessonDurationOptions","lesson_duration_options"],
  ["timezone","timezone"],["cancellationWindowHours","cancellation_window_hours"],
  ["timelyCancelEarnsMakeup","timely_cancel_earns_makeup"],
  ["lateCancelEarnsMakeup","late_cancel_earns_makeup"],
  ["noShowEarnsMakeup","no_show_earns_makeup"],
  ["teacherCancelEarnsMakeup","teacher_cancel_earns_makeup"],
  ["makeupCreditExpiryDays","makeup_credit_expiry_days"],
  ["billAttended","bill_attended"],["billNoShow","bill_no_show"],
  ["billTeacherCancel","bill_teacher_cancel"],
  ["billTimelyStudentCancel","bill_timely_student_cancel"],
  ["billLateStudentCancel","bill_late_student_cancel"],
  ["billMakeup","bill_makeup"],["defaultRateCents","default_rate_cents"],
  ["travelFeeCents","travel_fee_cents"],["durationRateCents","duration_rate_cents"],
  ["rateBasis","rate_basis"],["currency","currency"],
  ["invoiceCadence","invoice_cadence"],["paymentInstructions","payment_instructions"],
  ["paymentProvider","payment_provider"],["notifyInApp","notify_in_app"],
  ["notifyEmailPortalCancel","notify_email_portal_cancel"],
  ["notifyEmailInvoicePaid","notify_email_invoice_paid"],
  ["bccFamilyEmails","bcc_family_emails"],["bccEmail","bcc_email"],
  ["aiProvider","ai_provider"],
 ] as const;
 const changes={
  studioName:"Verified chess club "+randomUUID().slice(0,8),
  studioWebsite:"https://academy.chesscoachpal.example",
  studioContact:"Coaching front desk",studioInfo:"Teacher reviewed studio description",
  lessonLabel:"Coaching lesson",lessonDurationOptions:[30,45,60],
  timezone:"Europe/London",cancellationWindowHours:24,
  timelyCancelEarnsMakeup:true,lateCancelEarnsMakeup:false,
  noShowEarnsMakeup:false,teacherCancelEarnsMakeup:true,
  makeupCreditExpiryDays:60,billAttended:true,billNoShow:true,
  billTeacherCancel:false,billTimelyStudentCancel:false,
  billLateStudentCancel:true,billMakeup:false,
  defaultRateCents:4200,travelFeeCents:500,
  durationRateCents:{"30":3000,"45":3800},rateBasis:"per_lesson",
  currency:"USD",invoiceCadence:"manual",
  paymentInstructions:"Payment instructions confirmed by teacher",
  paymentProvider:"manual",notifyInApp:false,
  notifyEmailPortalCancel:false,notifyEmailInvoicePaid:false,
  bccFamilyEmails:false,bccEmail:null,aiProvider:"none",
 };
 const restoration=Object.fromEntries(mapping.map(([client,db])=>{
  const value=original[db];
  // Website accepts empty text for fields that are nullable at rest.
  const emptyText=["studioName","studioWebsite","studioContact","studioInfo",
   "lessonLabel","paymentInstructions"];
  return [client,value??(emptyText.includes(client)?"":null)];
 }));
 try{
  const mcpSave=await call("ccp_v1_studio_policy_update",{
   changes,confirmed:true,
  });
  expect(mcpSave.error).toBeUndefined();
  const browser=await page.request.get("/api/settings/policy");
  expect(browser.status(),await browser.text()).toBe(200);
  const saved=await browser.json() as Record<string,any>;
  for(const [client,db] of mapping){
   expect(saved[db],client+" was not persisted").toEqual(
    changes[client as keyof typeof changes]);
  }
  const webEdit=await page.request.put("/api/settings/policy",{
   data:{lessonLabel:"Reviewed website lesson",cancellationWindowHours:12,
    billTeacherCancel:true,defaultRateCents:null,
    travelFeeCents:null,bccEmail:null},
  });
  expect(webEdit.status(),await webEdit.text()).toBe(200);
  const mcpRead=await call("ccp_v1_studio_policy_get",{});
  expect(mcpRead.error).toBeUndefined();
  expect(mcpRead.data).toMatchObject({
   lesson_label:"Reviewed website lesson",cancellation_window_hours:12,
   bill_teacher_cancel:true,default_rate_cents:null,
   travel_fee_cents:null,bcc_email:null,
  });
  expect(mcpRead.data.stripe_secret_key).toBeNull();
  expect(mcpRead.data.ai_api_key).toBeNull();
 }finally{
  const res=await page.request.put("/api/settings/policy",{data:restoration});
  expect(res.status(),await res.text()).toBe(200);
 }
});
