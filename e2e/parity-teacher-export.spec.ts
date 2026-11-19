import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createScopedPortalAccess} from "./helpers/canonical-payer";

test("PARITY:PARITY-teacher-export preserves all current records but never restores old portal credentials",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
   name:"Export student "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const place=await call("ccp_workplaces_create",{
  name:"Export workplace "+randomUUID(),timezone:"UTC",
  currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(place.error).toBeUndefined();
 const workplaceId=place.data.entityId as string,studentId=student.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{
  workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const {token,grantId}=await createScopedPortalAccess(call,page,{
  workplaceId,studentId,permissions:["calendar"],
 });
 const full=await page.request.get("/api/settings/export");
 expect(full.status(),await full.text()).toBe(200);
 const websiteBackup=await full.json();
 const found=(websiteBackup.tables.portal_access_grants as Array<{
  id:string;token_digest:string|null;
 }>).find(x=>x.id===grantId);
 expect(found).toBeTruthy();
 expect(found?.token_digest??null).toBeNull();
 expect(JSON.stringify(websiteBackup)).not.toContain(token);
 const safe=await call("ccp_settings_export",{confirmed:true});
 if(safe.error){
  // Oversized backed-up teaching records are never disclosed to the model.
  expect(safe.error.code).toBe("EXPORT_TOO_LARGE");
  expect(JSON.stringify(safe)).not.toContain(token);
  return;
 }
 expect(safe.data.portalCredentialsExcluded).toBe(true);
 expect(Object.keys(safe.data.export).sort()).toEqual(Object.keys(websiteBackup).sort());
 expect(safe.data.export.tables.students.length).toBe(websiteBackup.tables.students.length);
 const modelGrants=safe.data.export.tables.portal_access_grants as Array<{
  id:string;token_digest:string|null;
 }>;
 expect(modelGrants.find(g=>g.id===grantId)?.token_digest??null).toBeNull();
 expect(JSON.stringify(safe.data)).not.toContain(token);
 // A copied digest cannot be used to reissue sharing authority.
 expect((await page.request.get("/portal/dev-portal-jordan")).status()).toBe(404);
});

test("PARITY:PARITY-teacher-all-csv-export website ZIP equals paged MCP sanitized CSV",async({page,request})=>{
 const {unzipSync,strFromU8}=await import("fflate");
 const call=await delegatedTool(page,request);
 const name="CSV student "+randomUUID();
 const created=await page.request.post("/api/students",{data:{name}});
 expect(created.status(),await created.text()).toBe(201);
 const contact=await call("ccp_contacts_create",{
  displayName:"Sanitized contact "+randomUUID(),
  email:"test-export-"+randomUUID()+"@example.com",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(contact.error).toBeUndefined();
 const catalog=await call("ccp_settings_export_csv",{confirmed:true});
 expect(catalog.error).toBeUndefined();
 const tables=catalog.data.tables as Record<string,{rowCount:number}>;
 expect(Object.keys(tables)).toEqual(expect.arrayContaining([
  "students","contacts","workplaces",
  "ccp_historical_attendance_evidence","teacher_profile",
 ]));
 const site=await page.request.get("/api/settings/export?format=csv");
 expect(site.status(),await site.text()).toBe(200);
 expect(site.headers()["content-type"]).toContain("application/zip");
 const zip=unzipSync(new Uint8Array(await site.body()));
 expect(Object.keys(zip)).toEqual(expect.arrayContaining([
  "README.json","students.csv","contacts.csv","workplaces.csv",
 ]));
 const contactsCsv=strFromU8(zip["contacts.csv"]);
 expect(contactsCsv).not.toMatch(/token_digest|portal_token/i);
 expect(contactsCsv).not.toContain("test-export-");
 const studentsCsv=strFromU8(zip["students.csv"]);
 expect(studentsCsv).toContain(name);
 const manifest=JSON.parse(strFromU8(zip["README.json"]));
 for(const [table,meta] of Object.entries(tables)){
  expect(manifest.tables[table]).toBe(meta.rowCount);
  expect(zip[table+".csv"]).toBeTruthy();
 }
 const chunks:string[]=[];
 let offset=0;
 for(let tries=0;tries<200;tries++){
  const response=await call("ccp_settings_export_csv",{
   confirmed:true,table:"students",offset,limit:20,
  });
  expect(response.error).toBeUndefined();
  const data=response.data as {csv:string;nextOffset:number|null;totalRows:number};
  if(chunks.length===0)chunks.push(data.csv);
  else chunks.push(data.csv.split("\r\n").slice(1).join("\r\n"));
  if(data.nextOffset===null)break;
  expect(data.nextOffset).toBeGreaterThan(offset);
  offset=data.nextOffset;
  if(tries===199)throw new Error("CSV pagination did not terminate");
 }
 expect(chunks.join("")).toBe(studentsCsv);
 const contacts=await call("ccp_settings_export_csv",{
  confirmed:true,table:"contacts",offset:0,limit:200,
 });
 expect(contacts.error).toBeUndefined();
 expect(contacts.data.csv).not.toMatch(/token_digest|portal_token/i);
 expect(contacts.data.csv).not.toContain("test-export-");
});
