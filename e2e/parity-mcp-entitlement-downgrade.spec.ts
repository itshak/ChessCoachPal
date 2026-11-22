import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("ENT-15: a previously advertised delegated MCP write rechecks student capacity after downgrade",async({page,request})=>{
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const email="mcp-entitlement-"+randomUUID()+"@example.com",password="SyntheticMcpEntitlement-123!";
 const identity=await admin.auth.admin.createUser({email,password,email_confirm:true});
 expect(identity.error).toBeNull();
 const teacherId=identity.data.user!.id;
 try{
  expect((await admin.from("teachers").insert({
   id:teacherId,email,display_name:"Synthetic MCP entitlement actor",
   onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,teacherId,0);
  const boost=await admin.from("teacher_entitlement_grants").insert({
   teacher_id:teacherId,kind:"capability_boost",capability_key:"students.active",
   capability_kind:"integer_limit",integer_value:2,unlimited:false,
   reason:"Synthetic entitlement before downgrade",request_id:randomUUID(),
  }).select("id").single();
  expect(boost.error).toBeNull();
  const call=await delegatedTool(page,request,"coach:read coach:write",{email,password});
  const advertised=(await call.listTools()).find(tool=>tool.name==="ccp_students_create");
  expect(advertised?.inputSchema).toBeDefined();
  const name="Synthetic retained roster "+randomUUID();
  const accepted=await call(advertised!.name,{name,idempotencyKey:randomUUID()});
  expect(accepted.error).toBeUndefined();
  expect(accepted.data.entityId).toBeTruthy();

  // Update the authority, not the authenticated OAuth client or its cached list.
  const revoked=await admin.from("teacher_entitlement_grants").update({revoked_at:new Date().toISOString()})
   .eq("teacher_id",teacherId).eq("id",boost.data!.id).select("revoked_at").single();
  expect(revoked.error).toBeNull();
  expect(revoked.data?.revoked_at).toBeTruthy();
  const deniedKey=randomUUID();
  const denied=await call(advertised!.name,{name:"Synthetic denied learner "+randomUUID(),idempotencyKey:deniedKey});
  expect(denied.error).toMatchObject({code:"CAPACITY_EXCEEDED"});
  expect(denied.data).toBeUndefined();
  const roster=await admin.from("students").select("id,name").eq("teacher_id",teacherId);
  expect(roster.error).toBeNull();
  expect(roster.data).toEqual([{id:accepted.data.entityId,name}]);
  const state=await admin.from("teacher_entitlement_state").select("active_student_count")
   .eq("teacher_id",teacherId).single();
  expect(state.error).toBeNull();
  expect(state.data?.active_student_count).toBe(1);
  const receipt=await admin.from("agent_tool_receipts").select("idempotency_key")
   .eq("teacher_id",teacherId).eq("idempotency_key",deniedKey).maybeSingle();
  expect(receipt.error).toBeNull();
  expect(receipt.data).toBeNull();
 }finally{
  expect((await admin.auth.admin.deleteUser(teacherId)).error).toBeNull();
 }
});
