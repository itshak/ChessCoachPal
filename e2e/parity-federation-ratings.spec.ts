import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin="http://localhost:3000";

test("PARITY:PARITY-federation-identity independent FIDE and national IDs, snapshots, website/MCP replay and security",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{
  name:"FIDE learner "+randomUUID(),idempotencyKey:randomUUID(),
 });
 expect(student.error).toBeUndefined();
 const id=student.data.entityId as string;
 const endpoint=`/api/students/${id}/federations`;
 const initial=await page.request.get(endpoint);
 expect(initial.status(),await initial.text()).toBe(200);
 const first=await initial.json();
 expect(first.identity).toMatchObject({fideId:null,
   fideFederationCode:null,nationalFederationPreference:null});
 expect(first.memberships).toEqual([]);expect(first.snapshots).toEqual([]);
 const mcpFirst=await call("ccp_student_federations_get",{studentId:id});
 expect(mcpFirst.error).toBeUndefined();expect(mcpFirst.data).toEqual(first);
 const edit=await page.request.put(`/api/students/${id}`,{
  headers:{origin},data:{fideId:"12345678",fideFederationCode:"ISR",
   nationalFederationPreference:"NONE"},
 });
 expect(edit.status(),await edit.text()).toBe(200);
 const afterProfile=await call("ccp_student_federations_get",{studentId:id});
 expect(afterProfile.error).toBeUndefined();
 expect(afterProfile.data.identity).toMatchObject({
  fideId:"12345678",fideFederationCode:"ISR",
  nationalFederationPreference:"NONE",suggestedFederationCode:null,
 });
 // The teacher hint is not a national membership, and explicit NONE wins.
 // Shared E2E teacher state must not be mutated by tests running in parallel.
 const defaultBefore=await call("ccp_teacher_federation_default_get",{});
 expect(defaultBefore.error).toBeUndefined();
 const defaultBrowser=await page.request.get("/api/teacher/federation-default");
 expect(defaultBrowser.status(),await defaultBrowser.text()).toBe(200);
 expect(defaultBefore.data).toEqual(await defaultBrowser.json());
 const rejected=await page.request.put("/api/teacher/federation-default",{
  headers:{origin},data:{defaultNationalFederationCode:"ISR",
   expectedDefaultNationalFederationCode:defaultBefore.data.defaultNationalFederationCode,
   confirmed:false},
 });
 expect(rejected.status()).toBe(400);
 const badMcp=await call("ccp_teacher_federation_default_set",{
  defaultNationalFederationCode:"ISR",expectedDefaultNationalFederationCode:null,
  confirmed:false,
 });
 expect(badMcp.error?.code).toBe("VALIDATION_ERROR");
 const memberInput={studentId:id,federationCode:"ISR",
  playerId:"CHESS-"+randomUUID(),idempotencyKey:randomUUID(),confirmed:true};
 const added=await call("ccp_student_federations_link",memberInput);
 expect(added.error).toBeUndefined();
 expect(added.data).toMatchObject({federationCode:"ISR",studentId:id,
  membershipStatus:"unverified",verifiedAt:null,replayed:false});
 const memberId=added.data.id as string;
 const replay=await page.request.post(endpoint,{headers:{origin},data:memberInput});
 expect(replay.status(),await replay.text()).toBe(201);
 expect((await replay.json()).replayed).toBe(true);
 const viaMcp=await call("ccp_student_federations_update",{
  studentId:id,membershipId:memberId,playerId:"MCP-"+randomUUID(),
  expectedRevision:1,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(viaMcp.error).toBeUndefined();
 expect(viaMcp.data).toMatchObject({membershipStatus:"unverified",revision:2});
 const updated=await page.request.patch(`${endpoint}/${memberId}`,{
  headers:{origin},data:{studentId:id,membershipId:memberId,
   playerId:"Edited-"+randomUUID(),expectedRevision:2,
   idempotencyKey:randomUUID(),confirmed:true},
 });
 expect(updated.status(),await updated.text()).toBe(200);
 expect(await updated.json()).toMatchObject({membershipStatus:"unverified",revision:3});
 const read=await call("ccp_student_federations_get",{studentId:id});
 expect(read.error).toBeUndefined();
 const websiteRead=await page.request.get(endpoint);
 expect(websiteRead.status(),await websiteRead.text()).toBe(200);
 expect(read.data).toEqual(await websiteRead.json());
 expect(read.data.memberships).toHaveLength(1);
 const mark={studentId:id,provider:"fide",timeControl:"rapid",rating:1762,
  observedAt:new Date(Date.now()-86400000).toISOString(),effectiveAt:null,
  sourceUrl:"https://ratings.fide.com/",requestId:randomUUID(),confirmed:true};
 const result=await page.request.post(`/api/students/${id}/federation-ratings`,{
  headers:{origin},data:mark,
 });
 expect(result.status(),await result.text()).toBe(201);
 expect((await result.json()).snapshot).toMatchObject({
  provider:"fide",time_control:"rapid",rating:1762,
  verification_state:"unverified",source:"teacher_manual"});
 const recorded=await call("ccp_student_federation_ratings_record",mark);
 expect(recorded.error).toBeUndefined();expect(recorded.data.replayed).toBe(true);
 const invalid=await call("ccp_student_federation_ratings_record",{
  ...mark,provider:"icf",timeControl:"blitz",requestId:randomUUID(),
 });
 expect(invalid.error?.code).toBe("VALIDATION_ERROR");
 const state=await call("ccp_student_federations_get",{studentId:id});
 expect(state.error).toBeUndefined();expect(state.data.snapshots).toHaveLength(1);
 expect(state.data.snapshots[0]).toMatchObject({rating:1762,
  verification_state:"unverified",source:"teacher_manual"});
 expect(state.data.sourceWarning).toMatch(/UNVERIFIED/);
 const notOwned=await call("ccp_student_federations_get",{studentId:randomUUID()});
 expect(notOwned.error?.code).toBe("NOT_FOUND");
 const noForeignBrowser=await page.request.get(`/api/students/${randomUUID()}/federations`);
 expect(noForeignBrowser.status()).toBe(404);
 await page.goto(`/students/${id}`);
 await expect(page.getByTestId("fide-id-input")).toHaveValue("12345678");
});

test("PARITY:PARITY-federation-read-only scoped delegation cannot write and national ID does not prove registration",async({page,request})=>{
 const call=await delegatedTool(page,request,"coach:read");
 const names=(await call.listTools()).map((x:{name:string})=>x.name);
 expect(names).toContain("ccp_student_federations_get");
 expect(names).toContain("ccp_teacher_federation_default_get");
 expect(names).not.toContain("ccp_student_federations_link");
 expect(names).not.toContain("ccp_student_federation_ratings_record");
 const blocked=await call("ccp_student_federations_link",{
  studentId:randomUUID(),federationCode:"ISR",playerId:"test",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(blocked.error?.code).toBe("FORBIDDEN");
});
