import {createHash,randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

/** A malformed *late* backup table must not partially import a valid early
 * student through either authenticated interface. This proves preflight shape
 * rejection, not transaction rollback for a later database write failure. */
test("PARITY:PARITY-safety-backup-preflight rejects late-table malformed imports before writes",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const exported=await page.request.get("/api/settings/export");
 expect(exported.status(),await exported.text()).toBe(200);
 const backup=await exported.json();
 const studentId=randomUUID();
 const payload={
   version:backup.version,exportedAt:new Date().toISOString(),
   teacherId:backup.teacherId,
   tables:{
     students:[{id:studentId,name:"Must not partially import "+randomUUID()}],
     payments:{id:randomUUID(),amount_cents:100},
   },
 };
 const before=await page.request.get("/api/students/"+studentId);
 expect(before.status()).toBe(404);
 const websitePreview=await page.request.put("/api/settings/import",{data:{payload}});
 expect(websitePreview.status(),await websitePreview.text()).toBe(400);
 const mcpPreview=await call("ccp_v1_settings_import_preview",{payload});
 expect(mcpPreview.error?.code).toBe("VALIDATION_ERROR");
 const digest=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
 const browserCommit=await page.request.post("/api/settings/import",{
   data:{payload,expectedSha256:digest,confirmed:true},
 });
 expect(browserCommit.status(),await browserCommit.text()).toBe(400);
 const modelCommit=await call("ccp_v1_settings_import_apply",{
   payload,expectedSha256:digest,confirmed:true,
 });
 expect(modelCommit.error?.code).toBe("VALIDATION_ERROR");
 const missing=await page.request.get("/api/students/"+studentId);
 expect(missing.status()).toBe(404);
 const modelLookup=await call("ccp_v1_students_profile",{studentId});
 expect(modelLookup.error?.code).toBe("NOT_FOUND");
});
