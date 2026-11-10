import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {mailpitMessagesTo} from "./helpers/mailpit";

/**
 * PARITY release acceptance: a model cannot silently transfer data or email a
 * family, and a website/MCP retry must not duplicate the external delivery.
 * All resources and email recipients below are synthetic and unique per run.
 */
test("PARITY:PARITY-safety-long-running-receipts confirms export/import/send with cross-surface receipts",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const exportDenied=await call("ccp_v1_settings_export",{});
  expect(exportDenied.error?.code).toBe("VALIDATION_ERROR");

  const websiteExport=await page.request.get("/api/settings/export");
  expect(websiteExport.status(),await websiteExport.text()).toBe(200);
  expect(websiteExport.headers()["cache-control"]).toContain("no-store");
  const backup=await websiteExport.json();
  const safe=await call("ccp_v1_settings_export",{confirmed:true});
  expect(safe.error).toBeUndefined();
  expect(safe.data.guardianPortalLinksExcluded).toBe(true);
  expect(safe.data.export.version).toBe(backup.version);
  expect(safe.data.bytes).toBeGreaterThan(0);

  // A minimal, uniquely-owned restore proves a real persisted import without
  // replaying someone else's backup or overwriting existing seed records.
  const studentId=randomUUID();
  const studentName="Receipt import learner "+randomUUID();
  const payload={
    version:backup.version,exportedAt:new Date().toISOString(),
    teacherId:backup.teacherId,
    tables:{students:[{id:studentId,name:studentName}]},
  };
  const preview=await call("ccp_v1_settings_import_preview",{payload});
  expect(preview.error).toBeUndefined();
  expect(preview.data.counts.students).toBe(1);
  expect(preview.data.sha256).toMatch(/^[a-f0-9]{64}$/);
  const before=await page.request.get("/api/students/"+studentId);
  expect(before.status()).toBe(404);
  const silent=await call("ccp_v1_settings_import_apply",{
    payload,expectedSha256:preview.data.sha256,
  });
  expect(silent.error?.code).toBe("VALIDATION_ERROR");
  const changed=await call("ccp_v1_settings_import_apply",{
    payload,expectedSha256:"0".repeat(64),confirmed:true,
  });
  expect(changed.error).toBeDefined();
  expect((await page.request.get("/api/students/"+studentId)).status()).toBe(404);
  const committed=await call("ccp_v1_settings_import_apply",{
    payload,expectedSha256:preview.data.sha256,confirmed:true,
  });
  expect(committed.error).toBeUndefined();
  expect(committed.data).toMatchObject({
    ok:true,sha256:preview.data.sha256,
    counts:{students:1},
  });
  const websiteStudent=await page.request.get("/api/students/"+studentId);
  expect(websiteStudent.status(),await websiteStudent.text()).toBe(200);
  expect((await websiteStudent.json()).name).toBe(studentName);
  const browserReplay=await page.request.post("/api/settings/import",{data:payload});
  expect(browserReplay.status(),await browserReplay.text()).toBe(200);
  expect(await browserReplay.json()).toEqual(committed.data);
  const afterMcp=await call("ccp_v1_students_profile",{studentId});
  expect(afterMcp.error).toBeUndefined();
  expect(afterMcp.data.name).toBe(studentName);

  // Preview reveals a count but never the portal token. External sends require
  // a second, explicit email approval, and a cross-client retry returns skipped.
  const recipient="receipt-proof-"+randomUUID()+"@example.com";
  const guardian=await call("ccp_v1_guardians_create",{
    name:"Receipt proof family "+randomUUID(),email:recipient,
    studentIds:[studentId],confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  const event=await call("ccp_v1_events_create",{
    title:"Receipt proof chess event "+randomUUID(),
    startsAt:"2042-11-10T09:00:00+02:00",
    endsAt:"2042-11-10T10:00:00+02:00",
    studentIds:[studentId],confirmed:true,
  });
  expect(event.error).toBeUndefined();
  const eventId=event.data.event.id as string;
  const path="/api/events/"+eventId+"/email";
  const browserPreview=await page.request.get(path);
  expect(browserPreview.status(),await browserPreview.text()).toBe(200);
  const modelPreview=await call("ccp_v1_events_email_preview",{eventId});
  expect(modelPreview.error).toBeUndefined();
  expect(modelPreview.data).toEqual(await browserPreview.json());
  expect(modelPreview.data.recipientCount).toBe(1);
  expect(JSON.stringify(modelPreview.data)).not.toContain("portal_token");
  const emailDenied=await call("ccp_v1_events_email_invites",{
    eventId,confirmed:true,
  });
  expect(emailDenied.error?.code).toBe("VALIDATION_ERROR");
  expect(await mailpitMessagesTo(request,recipient)).toHaveLength(0);
  const sent=await call("ccp_v1_events_email_invites",{
    eventId,confirmed:true,confirmedEmail:true,
  });
  expect(sent.error).toBeUndefined();
  expect(sent.data).toMatchObject({sent:1,skipped:0});
  await expect.poll(async()=> (await mailpitMessagesTo(request,recipient)).length,{
    timeout:10000,
  }).toBe(1);
  const websiteRetry=await page.request.post(path);
  expect(websiteRetry.status(),await websiteRetry.text()).toBe(200);
  expect(await websiteRetry.json()).toMatchObject({sent:0,skipped:1});
  const modelRetry=await call("ccp_v1_events_email_invites",{
    eventId,confirmed:true,confirmedEmail:true,
  });
  expect(modelRetry.error).toBeUndefined();
  expect(modelRetry.data).toMatchObject({sent:0,skipped:1});
  expect(await mailpitMessagesTo(request,recipient)).toHaveLength(1);
});
