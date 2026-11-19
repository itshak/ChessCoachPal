import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createAssignedPayer} from "./helpers/canonical-payer";

test("PARITY:PARITY-student-lifecycle archives all dated memberships atomically and restores selected history without changing credits",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const learner=await call("ccp_students_create",{
  name:"Temporal archive learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(learner.error).toBeUndefined();
 const studentId=learner.data.entityId as string;
 const places:string[]=[];
 for(let i=0;i<2;i++){
  const place=await call("ccp_workplaces_create",{
   name:"Historic campus "+randomUUID(),timezone:"UTC",currency:"USD",
   locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(place.error).toBeUndefined();
  places.push(place.data.entityId as string);
  expect((await call("ccp_workplaces_enroll",{
   workplaceId:places[i],studentId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 await createAssignedPayer(call,{
  studentId,workplaceId:places[0],effectiveFrom:"2040-01-01",
 });
 const purchased=await call("ccp_credits_package_create",{
  studentId,workplaceId:places[0],credits:3,durationMinutes:45,
  priceCents:7500,startsOn:"2042-01-01",expiresOn:"2042-12-31",
  requestId:randomUUID(),confirmed:true,
 });
 expect(purchased.error).toBeUndefined();
 const packageId=purchased.data.packageId as string;
 const websitePreview=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecyclePreview",studentId},
 });
 expect(websitePreview.status(),await websitePreview.text()).toBe(200);
 const before=(await websitePreview.json()).data;
 const mcpPreview=await call("ccp_students_lifecycle_preview",{studentId});
 expect(mcpPreview.error).toBeUndefined();
 expect(mcpPreview.data).toEqual(before);
 expect(before).toMatchObject({
  archived:false,canArchive:true,creditPolicy:"hold_without_refund_transfer_or_expiry_change",
 });
 expect(before.currentMemberships).toHaveLength(2);
 expect(before.creditPackages).toHaveLength(1);
 expect(before.creditPackages[0]).toMatchObject({
  packageId,purchasedCredits:3,redeemedCredits:0,adjustmentCredits:0,
  invoiceStatus:"draft",
 });
 const endArgs={
  studentId,mode:"archive",expectedUpdatedAt:before.expectedUpdatedAt,
  selectedWorkplaceIds:[],requestId:randomUUID(),confirmed:true,
  reason:"Teacher reviewed commitments and retained all outstanding lesson entitlements",
 };
 const ended=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecycleCommit",...endArgs},
 });
 expect(ended.status(),await ended.text()).toBe(200);
 const endedBody=(await ended.json()).data;
 expect(endedBody).toMatchObject({
  archived:true,closedPeriods:0,cancelledPeriods:2,replayed:false,
 });
 const retry=await call("ccp_students_lifecycle_commit",endArgs);
 expect(retry.error).toBeUndefined();
 expect(retry.data).toMatchObject({archived:true,replayed:true});
 const changed=await call("ccp_students_lifecycle_commit",{
  ...endArgs,reason:"Changed terms must never rewrite a confirmed archived lifecycle",
 });
 expect(changed.error?.code).toBe("CONFLICT");
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const archiveRows=await admin.from("workplace_enrollments")
  .select("workplace_id,ends_on,cancelled_at")
  .eq("student_id",studentId);
 expect(archiveRows.error).toBeNull();
 expect(archiveRows.data).toHaveLength(2);
 expect(archiveRows.data!.every(x=>x.cancelled_at!==null)).toBe(true);
 const held=await call("ccp_credits_packages_list",{studentId});
 expect(held.error).toBeUndefined();
 expect(held.data.packages.find((x:{id:string})=>x.id===packageId))
  .toMatchObject({credits:3,usedCredits:0});
 const reopen=await call("ccp_students_lifecycle_preview",{studentId});
 expect(reopen.error).toBeUndefined();
 expect(reopen.data).toMatchObject({archived:true,canReactivate:true});
 expect(reopen.data.previousWorkplaceIds.sort()).toEqual([...places].sort());
 const restoreArgs={
  studentId,mode:"reactivate",
  expectedUpdatedAt:reopen.data.expectedUpdatedAt,
  selectedWorkplaceIds:[places[0]],requestId:randomUUID(),
  reason:"Teacher explicitly reactivates the learner at one previously verified workplace",
  confirmed:true,
 };
 const restore=await page.request.post("/api/agent/v1",{
  data:{action:"students.lifecycleCommit",...restoreArgs},
 });
 expect(restore.status(),await restore.text()).toBe(200);
 expect((await restore.json()).data).toMatchObject({
  archived:false,restoredWorkplaces:[places[0]],replayed:false,
 });
 const restoreReplay=await call("ccp_students_lifecycle_commit",restoreArgs);
 expect(restoreReplay.error).toBeUndefined();
 expect(restoreReplay.data.replayed).toBe(true);
 const current=await call("ccp_workplaces_enrollments",{workplaceId:places[0]});
 expect(current.error).toBeUndefined();
 expect(current.data).toEqual(expect.arrayContaining([{student_id:studentId}]));
 const other=await call("ccp_workplaces_enrollments",{workplaceId:places[1]});
 expect(other.error).toBeUndefined();
 expect(other.data.some((x:{student_id:string})=>x.student_id===studentId)).toBe(false);
 const periods=await admin.from("workplace_enrollments")
  .select("workplace_id,starts_on,ends_on,cancelled_at")
  .eq("student_id",studentId);
 expect(periods.error).toBeNull();
 expect(periods.data).toHaveLength(3);
 expect(periods.data!.filter(x=>x.workplace_id===places[0])).toHaveLength(2);
 const after=await call("ccp_credits_packages_list",{studentId});
 expect(after.error).toBeUndefined();
 expect(after.data.packages.find((x:{id:string})=>x.id===packageId)?.usedCredits)
  .toBe(0);
 const foreign=await call("ccp_students_lifecycle_preview",{studentId:randomUUID()});
 expect(foreign.error?.code).toBe("NOT_FOUND");
});
