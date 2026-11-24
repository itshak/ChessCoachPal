import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: workplace coach estimates respect a frozen effective group without auto-posting",async({page,request,isolatedTeacher,baseURL})=>{
 const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const run=async(name:string,args:Record<string,unknown>)=>{
  const out=await call(name,args);expect(out.error,name).toBeUndefined();return out.data;
 };
 const {entityId:workplaceId}=await run("ccp_workplaces_create",{name:"Synthetic grouped compensation "+randomUUID(),
  timezone:"Asia/Jerusalem",currency:"USD",idempotencyKey:randomUUID()});
 const {entityId:studentId}=await run("ccp_students_create",{name:"Synthetic group learner "+randomUUID(),idempotencyKey:randomUUID()});
 const {entityId:groupId}=await run("ccp_groups_create",{workplaceId,name:"Group terms",idempotencyKey:randomUUID()});
 const {entityId:otherGroup}=await run("ccp_groups_create",{workplaceId,name:"Workplace terms",idempotencyKey:randomUUID()});
 for(const group of [groupId,otherGroup])await run("ccp_groups_enroll",{groupId:group,studentId,idempotencyKey:randomUUID()});
 const {id:billingAccountId}=await run("ccp_billing_accounts_create",{displayName:"Synthetic school",accountKind:"organization",...key()});
 const day="2059-12-01",next="2059-12-02";
 const make=async(group:string,startsAt:string)=>{
  const {entityId:sessionId}=await run("ccp_sessions_create",{workplaceId,groupId:group,
   title:"Synthetic completed group",startsAt,durationMinutes:60,idempotencyKey:randomUUID()});
  const details=await run("ccp_sessions_details",{sessionId});
  const attendance=await run("ccp_attendance_preview",{sessionId});
  await run("ccp_sessions_complete",{sessionId,expectedUpdatedAt:details.updated_at,...key(),attendance:[
   {studentId,status:"present",expectedUpdatedAt:attendance.attendance[0].updated_at}
  ]});
  return sessionId;
 };
 const groupSessionId=await make(groupId,"2059-11-30T22:15:00Z");
 await make(otherGroup,"2059-12-01T10:00:00Z");
 await make(groupId,"2059-12-02T10:00:00Z");
 const common={workplaceId,billingAccountId,agreementRole:"coach_earning",model:"per_session",currency:"USD",effectiveFrom:day};
 const regional=await run("ccp_compensation_agreements_create",{...common,rateCents:10000,...key()});
 const group=await run("ccp_compensation_agreements_create",{...common,groupId,rateCents:20000,effectiveTo:day,...key()});
 const from=day,to=next;
 const preview=async(agreementId:string)=>{
  const pathname="/api/compensation-agreements/"+agreementId+"/preview?"+new URLSearchParams({from,to});
  const www=await page.request.get(pathname);
  expect(www.status(),await www.text()).toBe(200);
  const mcp=await run("ccp_compensation_agreements_preview",{agreementId,from,to});
  expect(mcp).toEqual(await www.json());
  return mcp;
 };
 expect(await preview(regional.id)).toMatchObject({excludedGroupSessionCount:1,excludedExactSessionCount:0,
  projection:{eligibleSessionCount:2,expectedCents:20000},persistedObligation:false,paymentRecorded:false});
 expect(await preview(group.id)).toMatchObject({excludedGroupSessionCount:0,
  projection:{eligibleSessionCount:1,expectedCents:20000}});
 expect(await run("ccp_finance_ledger_list",{})).toMatchObject({obligations:[],receivedPayments:[]});
 const approval=(agreementId:string,expectedAmountCents:number)=>({agreementId,expectedRevision:1,
  expectedAmountCents,sessionId:groupSessionId,studentId:null,periodStart:day,periodEnd:day,...key()});
 const refused=await call("ccp_finance_obligation_approve",approval(regional.id,10000));
 expect(refused.error?.code).toBe("GROUP_AGREEMENT_REVIEW_REQUIRED");
 expect(refused.error?.message).toContain("resolve the overlap");

 await page.goto("/billing");
 const panel=page.getByRole("region",{name:"Native finance ledger"});
 await panel.getByLabel("Agreement and revision").selectOption(regional.id);
 await panel.getByLabel("Period start",{exact:true}).fill(day);
 await panel.getByLabel("Period end",{exact:true}).fill(day);
 await panel.getByLabel("Completed lesson UUID (blank for fixed monthly amount)",{exact:true}).fill(groupSessionId);
 await panel.getByRole("spinbutton",{name:"Amount in minor currency units",exact:false}).fill("10000");
 page.once("dialog",d=>void d.accept());
 const response=page.waitForResponse(res=>res.url().endsWith("/api/finance-ledger/obligations")&&res.request().method()==="POST");
 await panel.locator('form').getByRole("button",{name:"Review and confirm",exact:true}).press("Enter");
 const denial=await response;
 expect(denial.status(),await denial.text()).toBe(409);
 expect((await denial.json()).code).toBe("GROUP_AGREEMENT_REVIEW_REQUIRED");
 await expect(panel.getByRole("alert")).toContainText("If multiple group agreements apply, resolve the overlap first. Nothing was posted.");
 expect(await run("ccp_finance_ledger_list",{})).toMatchObject({obligations:[],receivedPayments:[]});

 const approved=approval(group.id,20000);
 const posting=await run("ccp_finance_obligation_approve",approved);
 expect(posting).toMatchObject({replayed:false,obligation:{session_id:groupSessionId,amount_cents:20000}});
 const replay=await page.request.post("/api/finance-ledger/obligations",{
  headers:{origin:new URL(baseURL!).origin},data:approved});
 expect(replay.status(),await replay.text()).toBe(201);
 expect(await replay.json()).toEqual({...posting,replayed:true});
 expect((await run("ccp_finance_ledger_list",{})).obligations).toHaveLength(1);

});
