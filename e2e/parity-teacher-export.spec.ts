import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-teacher-export preserves website backup but strips portal credentials from MCP",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write");
 const created=await call("ccp_guardians_create",{
   name:"Private portal test "+randomUUID(),confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const guardianId=created.data.id as string;
 expect(created.data.portal_token).toBeUndefined();
 const browserFamily=await page.request.get("/api/guardians/"+guardianId);
 expect(browserFamily.status(),await browserFamily.text()).toBe(200);
 const portalToken=(await browserFamily.json()).portal_token as string;
 expect(portalToken).toBeTruthy();
 const full=await page.request.get("/api/settings/export");
 expect(full.status(),await full.text()).toBe(200);
 const fullBackup=await full.json();
 const websiteRow=(fullBackup.tables.guardians as Array<{id:string;portal_token:string}>)
   .find(g=>g.id===guardianId);
 expect(websiteRow?.portal_token).toBe(portalToken);
 const safe=await call("ccp_settings_export",{confirmed:true});
 // This single seeded teacher also receives every synthetic student, chapter,
 // rating and lesson from preceding E2E scenarios. The explicitly bounded
 // model-safe MCP export is REQUIRED to refuse oversized private archives;
 // never weaken the guard or dump tokens to make this test pass. The signed-in
 // browser backup above still covers complete restoration.
 if(safe.error){
  expect(safe.error.code).toBe("EXPORT_TOO_LARGE");
  expect(JSON.stringify(safe)).not.toContain(portalToken);
  expect(safe.data).toBeUndefined();
  return;
 }
 expect(safe.error).toBeUndefined();
 expect(safe.data.guardianPortalLinksExcluded).toBe(true);
 expect(Object.keys(safe.data.export).sort()).toEqual(Object.keys(fullBackup).sort());
 const safeGuardians=safe.data.export.tables.guardians as Array<{
   id:string;portal_token?:string;
 }>;
 const matching=safeGuardians.find(g=>g.id===guardianId);
 expect(matching).toBeTruthy();
 expect(matching?.portal_token).toBeUndefined();
 expect(safeGuardians.every(g=>g.portal_token===undefined)).toBe(true);
 expect(JSON.stringify(safe.data)).not.toContain(portalToken);
});
