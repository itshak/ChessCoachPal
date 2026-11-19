import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/**
 * Backup failures must roll back ALL writes, not merely report the failed
 * table. Both website and delegated OAuth/MCP clients share this guarantee.
 * Synthetic records are unique and must never be persisted by this test.
 */
test("PARITY:PARITY-import-rollback rejects a later invalid row without persisting an earlier Contact",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const exportResponse=await page.request.get("/api/settings/export");
  expect(exportResponse.status(),await exportResponse.text()).toBe(200);
  const backup=await exportResponse.json();
  const contactId=randomUUID();
  const studentId=randomUUID();
  const payload={
    exportedAt:new Date().toISOString(),
    teacherId:backup.teacherId,
    tables:{
      contacts:[{id:contactId,display_name:"Atomic rollback contact "+randomUUID(),kind:"person",status:"active"}],
      // A malformed student fails AFTER the otherwise valid Contact insert.
      students:[{id:studentId,name:null}],
    },
  };
  const browserPreview=await page.request.put("/api/settings/import",{data:{payload}});
  expect(browserPreview.status(),await browserPreview.text()).toBe(200);
  const reviewed=await browserPreview.json();
  expect(reviewed.counts).toMatchObject({contacts:1,students:1});
  expect(reviewed.sha256).toMatch(/^[a-f0-9]{64}$/);
  const modelPreview=await call("ccp_settings_import_preview",{payload});
  expect(modelPreview.error).toBeUndefined();
  expect(modelPreview.data.sha256).toBe(reviewed.sha256);

  const before=await page.request.get("/api/contacts/"+contactId);
  expect(before.status()).toBe(404);
  const browserFailure=await page.request.post("/api/settings/import",{
    data:{payload,expectedSha256:reviewed.sha256,confirmed:true},
  });
  expect(browserFailure.status()).toBeGreaterThanOrEqual(400);
  expect((await page.request.get("/api/contacts/"+contactId)).status()).toBe(404);

  // An unsuccessful transaction must not leave a replay receipt claiming
  // success or any partial contact/student data after a different client retry.
  const modelFailure=await call("ccp_settings_import_apply",{
    payload,expectedSha256:reviewed.sha256,confirmed:true,
  });
  expect(modelFailure.error).toBeDefined();
  expect((await page.request.get("/api/contacts/"+contactId)).status()).toBe(404);
  expect((await page.request.get("/api/students/"+studentId)).status()).toBe(404);
});
