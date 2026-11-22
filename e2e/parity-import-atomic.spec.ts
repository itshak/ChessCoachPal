import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

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

test("PARITY:PARITY-restore-capacity rolls back reviewed backup and replays the same digest after capacity is freed",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="capacity-restore-"+randomUUID()+"@example.com";
 const password="SyntheticRestoreCapacity-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic restore capacity",
   onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,1);
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const contactId=randomUUID();
  const studentIds=[randomUUID(),randomUUID()];
  const payload={
   exportedAt:new Date().toISOString(),teacherId,
   tables:{
    contacts:[{id:contactId,display_name:"Synthetic guardian "+randomUUID(),kind:"person",status:"active"}],
    students:studentIds.map(id=>({id,name:"Synthetic backup learner "+id})),
   },
  };
  const preview=await page.request.put("/api/settings/import",{data:{payload}});
  expect(preview.status(),await preview.text()).toBe(200);
  const review=await preview.json();
  expect(review.counts).toMatchObject({contacts:1,students:2});
  expect(review.sha256).toMatch(/^[a-f0-9]{64}$/);
  const modelPreview=await call("ccp_settings_import_preview",{payload});
  expect(modelPreview.error).toBeUndefined();
  expect(modelPreview.data.sha256).toBe(review.sha256);
  const body={payload,expectedSha256:review.sha256,confirmed:true};
  const persisted=async(contacts:number,students:number,receipts:number)=>{
   const expected={contacts,students,teacher_backup_import_receipts:receipts};
   for(const [table,n] of Object.entries(expected)){
    const {count,error}=await admin.from(table).select("*",{head:true,count:"exact"}).eq("teacher_id",teacherId);
    expect(error,table).toBeNull();
    expect(count,table).toBe(n);
   }
   const state=await admin.from("teacher_entitlement_state").select("active_student_count").eq("teacher_id",teacherId).single();
   expect(state.error).toBeNull();
   expect(state.data?.active_student_count).toBe(students);
  };
  const denied=await page.request.post("/api/settings/import",{data:body});
  expect(denied.status(),await denied.text()).toBe(409);
  expect((await denied.json()).code).toBe("CAPACITY_EXCEEDED");
  await persisted(0,0,0);
  expect((await call("ccp_settings_import_apply",body)).error?.code).toBe("CAPACITY_EXCEEDED");
  await persisted(0,0,0);
  await configureSyntheticStudentCapacity(admin,teacherId,2);
  const accepted=await call("ccp_settings_import_apply",body);
  expect(accepted.error).toBeUndefined();
  expect(accepted.data).toMatchObject({ok:true,sha256:review.sha256,counts:{contacts:1,students:2}});
  const replay=await page.request.post("/api/settings/import",{data:body});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toEqual(accepted.data);
  await persisted(1,2,1);
  const readback=await admin.from("students").select("id").eq("teacher_id",teacherId);
  expect(readback.error).toBeNull();
  expect(readback.data?.map(row=>row.id).sort()).toEqual(studentIds.sort());
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
