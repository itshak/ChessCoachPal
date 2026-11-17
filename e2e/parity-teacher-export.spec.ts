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

test("PARITY:PARITY-teacher-all-csv-export website ZIP equals paged MCP sanitized CSV",async({page,request})=>{
 const {unzipSync,strFromU8}=await import("fflate");
 const call=await delegatedTool(page,request);
 const named="CSV pupil "+randomUUID();
 const pupil=await page.request.post("/api/students",{data:{name:named}});
 expect(pupil.status(),await pupil.text()).toBe(201);
 const privateGuardian=await call("ccp_guardians_create",{
   name:"Secret CSV guardian "+randomUUID(),confirmed:true,
 });
 expect(privateGuardian.error).toBeUndefined();
 const guardian=await page.request.get("/api/guardians/"+privateGuardian.data.id);
 expect(guardian.status()).toBe(200);
 const token=(await guardian.json()).portal_token as string;
 expect(token).toBeTruthy();
 const catalog=await call("ccp_settings_export_csv",{confirmed:true});
 expect(catalog.error).toBeUndefined();
 const tables=catalog.data.tables as Record<string,{rowCount:number}>;
 expect(Object.keys(tables)).toEqual(expect.arrayContaining([
   "students","guardians","workplaces","ccp_historical_attendance_evidence","teacher_profile"]));
 const site=await page.request.get("/api/settings/export?format=csv");
 expect(site.status(),await site.text()).toBe(200);
 expect(site.headers()["content-type"]).toContain("application/zip");
 const zip=unzipSync(new Uint8Array(await site.body()));
 expect(Object.keys(zip)).toEqual(expect.arrayContaining([
   "README.json","students.csv","guardians.csv","workplaces.csv"]));
 const guardiansCsv=strFromU8(zip["guardians.csv"]);
 expect(guardiansCsv).not.toContain(token);
 expect(guardiansCsv).not.toContain("portal_token");
 const studentsCsv=strFromU8(zip["students.csv"]);
 expect(studentsCsv).toContain(named);
 const manifest=JSON.parse(strFromU8(zip["README.json"]));
 for(const [table,meta] of Object.entries(tables)){
  expect(manifest.tables[table]).toBe(meta.rowCount);
  expect(zip[table+".csv"]).toBeTruthy();
 }
 // Verify full MCP CSV pagination against website bytes, not just tool names.
 const csvChunks:string[]=[];
 let offset=0;
 for(let tries=0;tries<200;tries++){
  const response=await call("ccp_settings_export_csv",{
   confirmed:true,table:"students",offset,limit:20,
  });
  expect(response.error).toBeUndefined();
  const data=response.data as {csv:string;nextOffset:number|null;totalRows:number};
  if(csvChunks.length===0)csvChunks.push(data.csv);
  else csvChunks.push(data.csv.split("\r\n").slice(1).join("\r\n"));
  if(data.nextOffset===null)break;
  expect(data.nextOffset).toBeGreaterThan(offset);
  offset=data.nextOffset;
  if(tries===199)throw new Error("CSV pagination did not terminate");
 }
 expect(csvChunks.join("")).toBe(studentsCsv);
 const guardians=await call("ccp_settings_export_csv",{
  confirmed:true,table:"guardians",offset:0,limit:200,
 });
 expect(guardians.error).toBeUndefined();
 expect(JSON.stringify(guardians.data)).not.toContain(token);
 expect(guardians.data.csv).not.toContain("portal_token");
});
