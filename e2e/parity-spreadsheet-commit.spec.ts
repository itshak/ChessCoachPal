import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-spreadsheet-preview-commit-replay shares mapping and deduplicated receipt",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const name="CSV chess learner "+randomUUID(),parent="Guardian "+randomUUID().slice(0,7);
 const csv="Student Name,Guardian Name\n"+name+","+parent+"\n";
 const filename="parity-pupils.csv";
 const fromMcp=await call("ccp_import_spreadsheet_parse",{
   filename,base64:Buffer.from(csv).toString("base64"),
 });
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data.previewTotal).toBe(1);
 const webParse=await page.request.post("/api/import/spreadsheet/parse",{
   multipart:{file:{name:filename,mimeType:"text/csv",buffer:Buffer.from(csv)}},
 });
 expect(webParse.status(),await webParse.text()).toBe(200);
 const parsed=await webParse.json();
 expect(fromMcp.data.rows).toEqual(parsed.rows);
 expect(fromMcp.data.mapping).toEqual(parsed.mapping);
 const rows=parsed.rows as Record<string,string>[],mapping=parsed.mapping as Record<string,string|null>;
 const webPreview=await page.request.put("/api/import/spreadsheet/parse",{
   data:{rows,mapping},
 });
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping});
 expect(modelPreview.error).toBeUndefined();
 expect(modelPreview.data).toEqual(await webPreview.json());
 const idempotencyKey=randomUUID();
 const write=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey,confirmed:true,
 });
 expect(write.error).toBeUndefined();
 expect(write.data.studentsCreated).toBe(1);
 expect(write.data.receiptId).toBe(idempotencyKey);
 const webReplay=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey},
 });
 expect(webReplay.status(),await webReplay.text()).toBe(200);
 expect(await webReplay.json()).toEqual(write.data);
 const roster=await page.request.get("/api/students?query="+encodeURIComponent(name));
 expect(roster.status()).toBe(200);
 expect((await roster.json()).students.filter((s:{name:string})=>s.name===name))
   .toHaveLength(1);
 expect(JSON.stringify(write.data)).not.toContain("portal_token");
});

test("PARITY:PARITY-spreadsheet-archived-status-website-MCP-atomic-roundtrip",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const historicalName="Archived imported chess learner "+randomUUID();
 const currentName="Active imported chess learner "+randomUUID();
 const csv="Student Name,Archived\\n"+historicalName+",inactive\\n"+currentName+",active\\n";
 const filename="historical-learners.csv";
 const parsedResponse=await page.request.post("/api/import/spreadsheet/parse",{
   multipart:{file:{name:filename,mimeType:"text/csv",buffer:Buffer.from(csv)}},
 });
 expect(parsedResponse.status(),await parsedResponse.text()).toBe(200);
 const parsed=await parsedResponse.json();
 expect(parsed.mapping.archived).toBe("Archived");
 expect(parsed.previewRows.map((r:{archived:boolean})=>r.archived)).toEqual([true,false]);
 const {rows,mapping}=parsed as {rows:Record<string,string>[];mapping:Record<string,string|null>};
 const modelPreview=await call("ccp_import_spreadsheet_preview",{rows,mapping});
 expect(modelPreview.error).toBeUndefined();
 const browserPreview=await page.request.put("/api/import/spreadsheet/parse",{data:{rows,mapping}});
 expect(browserPreview.status(),await browserPreview.text()).toBe(200);
 expect(modelPreview.data).toEqual(await browserPreview.json());
 const key=randomUUID();
 const browserCommit=await page.request.post("/api/import/spreadsheet/commit",{
   data:{rows,mapping,idempotencyKey:key},
 });
 expect(browserCommit.status(),await browserCommit.text()).toBe(200);
 const committed=await browserCommit.json();
 expect(committed.studentsCreated).toBe(2);
 const mcpReplay=await call("ccp_import_spreadsheet_commit",{
   rows,mapping,idempotencyKey:key,confirmed:true,
 });
 expect(mcpReplay.error).toBeUndefined();
 expect(mcpReplay.data).toEqual(committed);
 const archivedWebsite=await page.request.get("/api/students?archivedOnly=true&query="+encodeURIComponent(historicalName));
 expect(archivedWebsite.status()).toBe(200);
 expect((await archivedWebsite.json()).students.some((s:{name:string})=>s.name===historicalName)).toBe(true);
 const archivedMcp=await call("ccp_students_roster",{query:historicalName,archivedOnly:true});
 expect(archivedMcp.error).toBeUndefined();
 expect(((archivedMcp.data as {students:Array<{name:string}>}).students)
   .some(s=>s.name===historicalName)).toBe(true);
 const activeWebsite=await page.request.get("/api/students?query="+encodeURIComponent(currentName));
 expect(activeWebsite.status()).toBe(200);
 expect((await activeWebsite.json()).students.some((s:{name:string})=>s.name===currentName)).toBe(true);
 const excluded=await page.request.get("/api/students?query="+encodeURIComponent(historicalName));
 expect(excluded.status()).toBe(200);
 expect((await excluded.json()).students.some((s:{name:string})=>s.name===historicalName)).toBe(false);
});
