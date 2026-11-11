import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-legacy-material-to-typed-source preserves evidence and owner-scoped browser-MCP mapping",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const suffix=randomUUID().slice(0,8);
  const student=await call("ccp_v1_students_create",{
    name:"Typed migration learner "+suffix,idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const legacySource=await call("ccp_v1_chess_resources_link",{
    studentId,label:"Historic study "+suffix,
    url:"https://lichess.org/study/Ab12Cd34",
    resourceType:"lichess_study",requestId:randomUUID(),
  });
  expect(legacySource.error).toBeUndefined();
  const resourceId=legacySource.data.id as string;
  const created=await page.request.post("/api/training/materials",{data:{
    kind:"study_chapter",title:"Typed study "+suffix,description:"Teacher-reviewed identity",
    sourceUrl:"https://lichess.org/study/Ab12Cd34",
    details:{provider:"lichess",studyId:"Ab12Cd34",chapterId:null},
    requestId:randomUUID(),
  }});
  expect(created.status(),await created.text()).toBe(201);
  const materialId=(await created.json()).material.id as string;

  const noInferredTeaching=await page.request.get("/api/coaching/materials?"+
    new URLSearchParams({studentId}));
  expect(noInferredTeaching.status(),await noInferredTeaching.text()).toBe(200);
  expect((await noInferredTeaching.json()).total).toBe(0);

  const listArgs={studentId,limit:30,offset:0};
  const oldWebsite=await page.request.get("/api/coaching/materials/legacy-bridge?"+
    new URLSearchParams({studentId,limit:"30",offset:"0"}));
  expect(oldWebsite.status(),await oldWebsite.text()).toBe(200);
  const original=await oldWebsite.json();
  expect(original.truthBasis).toBe("teacher_confirmed_mapping_only");
  expect(original.entries.find((x:{id:string})=>x.id===resourceId).mappedMaterial).toBeNull();
  const oldMcp=await call("ccp_v1_material_legacy_bridge_list",listArgs);
  expect(oldMcp.error).toBeUndefined();
  expect(oldMcp.data).toEqual(original);

  const wrongIdentity=await call("ccp_v1_material_legacy_bridge_change",{
    resourceId,materialId:randomUUID(),action:"link",requestId:randomUUID(),confirmed:true,
  });
  expect(wrongIdentity.error?.code).toBe("NOT_FOUND");
  const linkArgs={resourceId,materialId,action:"link",requestId:randomUUID(),confirmed:true};
  const linked=await page.request.post("/api/coaching/materials/legacy-bridge",{data:linkArgs});
  expect(linked.status(),await linked.text()).toBe(200);
  expect((await linked.json()).replayed).toBe(false);
  const replay=await call("ccp_v1_material_legacy_bridge_change",linkArgs);
  expect(replay.error).toBeUndefined();
  expect(replay.data.replayed).toBe(true);
  const changedKey=await call("ccp_v1_material_legacy_bridge_change",{
    ...linkArgs,materialId:randomUUID(),
  });
  expect(changedKey.error?.code).toBe("IDEMPOTENCY_CONFLICT");

  const mapped=await call("ccp_v1_material_legacy_bridge_list",listArgs);
  expect(mapped.error).toBeUndefined();
  const mapping=mapped.data.entries.find((x:{id:string})=>x.id===resourceId);
  expect(mapping.mappedMaterial.id).toBe(materialId);
  expect(mapping.mappedMaterial.kind).toBe("study_chapter");
  expect(mapping.resource_type).toBe("lichess_study");
  const mappedWeb=await page.request.get("/api/coaching/materials/legacy-bridge?"+
    new URLSearchParams({studentId,limit:"30",offset:"0"}));
  expect(mapped.data).toEqual(await mappedWeb.json());

  const archivePreview=await page.request.get("/api/training/materials/lifecycle?"+
    new URLSearchParams({materialId}));
  expect(archivePreview.status(),await archivePreview.text()).toBe(200);
  const impact=await archivePreview.json();
  expect(impact.legacyResourceCount).toBe(1);
  expect(impact.canArchive).toBe(false);
  const archiveRejected=await call("ccp_v1_learning_material_lifecycle_change",{
    materialId,expectedRevision:impact.revision,action:"archive",
    requestId:randomUUID(),confirmed:true,
  });
  expect(archiveRejected.error?.code).toBe("HISTORY_DEPENDENCIES");

  const unlinkArgs={resourceId,materialId,action:"unlink",requestId:randomUUID(),confirmed:true};
  const unlinked=await call("ccp_v1_material_legacy_bridge_change",unlinkArgs);
  expect(unlinked.error).toBeUndefined();
  expect(unlinked.data.replayed).toBe(false);
  const unlinkReplay=await page.request.post("/api/coaching/materials/legacy-bridge",{data:unlinkArgs});
  expect(unlinkReplay.status(),await unlinkReplay.text()).toBe(200);
  expect((await unlinkReplay.json()).replayed).toBe(true);
  const final=await page.request.get("/api/coaching/materials/legacy-bridge?"+
    new URLSearchParams({studentId,limit:"30",offset:"0"}));
  expect(final.status()).toBe(200);
  expect((await final.json()).entries.find((x:{id:string})=>x.id===resourceId).mappedMaterial).toBeNull();
  expect((await page.request.get("/api/coaching/materials?"+new URLSearchParams({studentId}))).status()).toBe(200);
  const afterEvidence=await page.request.get("/api/coaching/materials?"+new URLSearchParams({studentId}));
  expect((await afterEvidence.json()).total).toBe(0);
});
