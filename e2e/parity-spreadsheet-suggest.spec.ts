import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-spreadsheet-suggest-local-vs-ai-consent enforces identical local mappings and provider privacy",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const headers=["Student Name","Guardian Name","Birthdate","Chess.com account"];
 const sampleRows=[{"Student Name":"Synthetic Pupil","Guardian Name":"Synthetic Parent",
  "Birthdate":"2015-07-01","Chess.com account":"synthetic_coach_test"}];
 const payload={headers,sampleRows,useAi:false};
 // Explicit local choice is safe without any external AI consent.
 const web=await page.request.post("/api/import/spreadsheet/suggest",{data:payload});
 expect(web.status(),await web.text()).toBe(200);
 const local=await web.json() as {mapping:Record<string,string|null>;warning:string|null};
 expect(local.warning).toBeNull();
 expect(Object.keys(local.mapping).length).toBeGreaterThan(0);
 const model=await call("ccp_v1_import_spreadsheet_suggest",payload);
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(local);
 // Omitted mode must now behave identically on website and MCP: offline
 // deterministic mapping, without sending private learner samples to AI.
 const defaultWeb=await page.request.post("/api/import/spreadsheet/suggest",{
  data:{headers,sampleRows},
 });
 expect(defaultWeb.status(),await defaultWeb.text()).toBe(200);
 expect(await defaultWeb.json()).toEqual(local);
 const unconfirmedModel=await call("ccp_v1_import_spreadsheet_suggest",{
  headers,sampleRows,useAi:true,
 });
 expect(unconfirmedModel.error?.code).toBe("VALIDATION_ERROR");
 const explicitUnconfirmed=await page.request.post("/api/import/spreadsheet/suggest",{
  data:{headers,sampleRows,useAi:true,confirmedExternal:false},
 });
 expect(explicitUnconfirmed.status(),await explicitUnconfirmed.text()).toBe(400);
 expect((await explicitUnconfirmed.json()).code).toBe("CONFIRMATION_REQUIRED");

 // Both transport contracts must reject malformed or oversized samples and
 // NOT call an external service even when external approval was omitted.
 const badRows=[{"Student Name":4}];
 const malformedSite=await page.request.post("/api/import/spreadsheet/suggest",{
  data:{headers,sampleRows:badRows,useAi:false},
 });
 expect(malformedSite.status(),await malformedSite.text()).toBe(400);
 expect((await malformedSite.json()).code).toBe("VALIDATION_ERROR");
 const malformedModel=await call("ccp_v1_import_spreadsheet_suggest",{
  headers,sampleRows:badRows,useAi:false,
 });
 expect(malformedModel.error?.code).toBe("VALIDATION_ERROR");
 // Unknown fields must be denied equally, not ignored in the website while
 // being rejected by the strict MCP tool contract.
 const unknownWeb=await page.request.post("/api/import/spreadsheet/suggest",{
  data:{...payload,token:"do-not-ingest"},
 });
 expect(unknownWeb.status(),await unknownWeb.text()).toBe(400);
 expect((await unknownWeb.json()).code).toBe("VALIDATION_ERROR");
 const unknownMcp=await call("ccp_v1_import_spreadsheet_suggest",{
  ...payload,token:"do-not-ingest",
 });
 expect(unknownMcp.error?.code).toBe("VALIDATION_ERROR");
});
