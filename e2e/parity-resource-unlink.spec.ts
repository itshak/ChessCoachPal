import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const material=()=>({
 kind:"study_chapter",title:"Linked chapter "+randomUUID().slice(0,8),
 description:"",sourceUrl:"https://lichess.org/study/AbCd1234",
 details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},
 requestId:randomUUID(),
});

test("PARITY:material links support create, website/MCP correction, replay and safe unlink",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Material link "+randomUUID(),idempotencyKey:randomUUID(),
 })).data;
 const studentId=student.entityId as string;
 const original=await call("ccp_v1_learning_materials_create",material());
 const other=await call("ccp_v1_learning_materials_create",material());
 expect(original.error).toBeUndefined();expect(other.error).toBeUndefined();
 const materialId=original.data.material.id as string;
 const altMaterialId=other.data.material.id as string;
 const key=randomUUID();
 const linked=await call("ccp_v1_material_links_create",{
   studentId,materialId,requestId:key,confirmed:true,
 });
 expect(linked.error).toBeUndefined();
 const link=linked.data.link;
 const replay=await page.request.post("/api/agent/v1",{
   data:{action:"materials.links.create",studentId,materialId,requestId:key,confirmed:true},
 });
 expect(replay.status(),await replay.text()).toBe(201);
 expect((await replay.json()).data).toMatchObject({replayed:true,link:{id:link.id}});
 const conflicting=await call("ccp_v1_material_links_create",{
   studentId,materialId:altMaterialId,requestId:key,confirmed:true,
 });
 expect(conflicting.error?.code).toBe("IDEMPOTENCY_CONFLICT");
 const corrected=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.update",linkId:link.id,materialId:altMaterialId,
   expectedRevision:link.revision,confirmed:true,
 }});
 expect(corrected.status(),await corrected.text()).toBe(200);
 const revision=(await corrected.json()).data.link.revision as number;
 const viaMcp=await call("ccp_v1_material_links_list",{studentId});
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data.links.find((l:{id:string})=>l.id===link.id).material_id).toBe(altMaterialId);
 const stale=await call("ccp_v1_material_links_update",{
   linkId:link.id,materialId,expectedRevision:link.revision,confirmed:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const inspected=await call("ccp_v1_material_links_unlink_impact",{linkId:link.id});
 expect(inspected.data).toMatchObject({canUnlink:true,evidencePreserved:true,revision});
 const unlink=await call("ccp_v1_material_links_unlink",{
   linkId:link.id,expectedRevision:revision,confirmed:true,
 });
 expect(unlink.error).toBeUndefined();
 expect(unlink.data).toMatchObject({unlinked:true,evidencePreserved:true});
 const after=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.list",studentId,
 }});
 expect((await after.json()).data.links.some((l:{id:string})=>l.id===link.id)).toBe(false);
 const catalog=await call("ccp_v1_learning_materials_get",{materialId:altMaterialId});
 expect(catalog.error).toBeUndefined();
});

test("PARITY:unlinking a student material association preserves teacher-attested history",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=(await call("ccp_v1_students_create",{
   name:"Evidence preservation "+randomUUID(),idempotencyKey:randomUUID(),
 })).data;
 const studentId=student.entityId as string;
 const canonical=await call("ccp_v1_learning_materials_create",material());
 expect(canonical.error).toBeUndefined();
 const materialId=canonical.data.material.id as string;
 const linked=await call("ccp_v1_material_links_create",{
   studentId,materialId,requestId:randomUUID(),confirmed:true,
 });
 expect(linked.error).toBeUndefined();
 const claim=await call("ccp_v1_materials_history_record",{
   studentId,materialId,stage:"taught",occurredOn:"2027-04-01",
   note:"Attested on this day",requestId:randomUUID(),confirmed:true,
 });
 expect(claim.error).toBeUndefined();
 const impact=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.unlinkImpact",linkId:linked.data.link.id,
 }});
 expect(impact.status()).toBe(200);
 expect((await impact.json()).data.evidencePreserved).toBe(true);
 const removed=await call("ccp_v1_material_links_unlink",{
   linkId:linked.data.link.id,expectedRevision:linked.data.link.revision,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 const ledger=await call("ccp_v1_materials_history_list",{studentId});
 expect(ledger.error).toBeUndefined();
 expect(ledger.data.entries.some((x:{id:string})=>x.id===claim.data.id)).toBe(true);
 const preview=await call("ccp_v1_learning_material_archive_preview",{materialId});
 expect(preview.error).toBeUndefined();
 expect(preview.data.canArchive).toBe(false);
 expect(preview.data.evidenceCount).toBeGreaterThanOrEqual(1);
});
