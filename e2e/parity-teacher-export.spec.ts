import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-teacher-export preserves website backup but strips portal credentials from MCP",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write");
 const created=await call("ccp_v1_guardians_create",{
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
 const safe=await call("ccp_v1_settings_export",{confirmed:true});
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
