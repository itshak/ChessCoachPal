import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin="http://localhost:3000";

test("PARITY:PARITY-student-billing-assignment one explicit payer with effective dates, replay and website/MCP parity",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const student=await call("ccp_students_create",{name:"Payer learner "+randomUUID(),idempotencyKey:randomUUID()});
 expect(student.error).toBeUndefined();
 const studentId=student.data.entityId as string;
 const workplace=await call("ccp_workplaces_create",{
   name:"Payer campus "+randomUUID(),timezone:"UTC",currency:"USD",locale:"en",
   policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 expect((await call("ccp_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:randomUUID(),
 })).error).toBeUndefined();
 const accounts:string[]=[];
 for(const name of ["Payer A","Payer B"]){
   const a=await call("ccp_billing_accounts_create",{
    displayName:name+" "+randomUUID(),accountKind:"organization",
    idempotencyKey:randomUUID(),confirmed:true,
   });
   expect(a.error).toBeUndefined();
   accounts.push(a.data.id as string);
 }
 const endpoint=`/api/students/${studentId}/billing-assignments`;
 const none=await page.request.get(endpoint);
 expect(none.status(),await none.text()).toBe(200);
 expect((await none.json()).assignments).toEqual([]);
 expect((await call("ccp_student_billing_assignments_list",{studentId})).data).toEqual(await none.json());
 const input={studentId,workplaceId,billingAccountId:accounts[0],
   effectiveFrom:"2046-01-01",effectiveTo:null,
   idempotencyKey:randomUUID(),confirmed:true};
 const created=await call("ccp_student_billing_assignments_create",input);
 expect(created.error).toBeUndefined();
 expect(created.data).toMatchObject({studentId,workplaceId,
  billingAccountId:accounts[0],revision:1,replayed:false});
 const id=created.data.id as string;
 const retry=await page.request.post(endpoint,{headers:{origin},data:input});
 expect(retry.status(),await retry.text()).toBe(201);
 expect((await retry.json()).replayed).toBe(true);
 const overlapping=await page.request.post(endpoint,{headers:{origin},data:{
   ...input,idempotencyKey:randomUUID(),billingAccountId:accounts[1],
 }});
 expect(overlapping.status()).toBe(409);
 const overlapTool=await call("ccp_student_billing_assignments_create",{
   ...input,idempotencyKey:randomUUID(),billingAccountId:accounts[1],
 });
 expect(overlapTool.error?.code).toBe("PAYER_OVERLAP");
 const closeInput={studentId,assignmentId:id,expectedRevision:1,
   effectiveTo:"2046-02-28",idempotencyKey:randomUUID(),confirmed:true};
 const ended=await page.request.patch(`${endpoint}/${id}`,{
  headers:{origin},data:closeInput,
 });
 expect(ended.status(),await ended.text()).toBe(200);
 expect((await ended.json()).effectiveTo).toBe("2046-02-28");
 const closeReplay=await call("ccp_student_billing_assignments_end",closeInput);
 expect(closeReplay.error).toBeUndefined();
 expect(closeReplay.data).toMatchObject({id,effectiveTo:"2046-02-28",replayed:true});
 const second=await call("ccp_student_billing_assignments_create",{
   ...input,billingAccountId:accounts[1],effectiveFrom:"2046-03-01",
   idempotencyKey:randomUUID(),
 });
 expect(second.error).toBeUndefined();
 expect(second.data).toMatchObject({billingAccountId:accounts[1],replayed:false});
 const listed=await call("ccp_student_billing_assignments_list",{studentId,workplaceId});
 expect(listed.error).toBeUndefined();
 const website=await page.request.get(endpoint+"?workplaceId="+workplaceId);
 expect(website.status(),await website.text()).toBe(200);
 expect(listed.data).toEqual(await website.json());
 expect(listed.data.assignments).toHaveLength(2);
 const old=listed.data.assignments.find((a:{id:string})=>a.id===id);
 expect(old).toMatchObject({billingAccountId:accounts[0],effectiveTo:"2046-02-28"});
 const unavailable=await call("ccp_student_billing_assignments_list",{studentId:randomUUID()});
 expect(unavailable.error?.code).toBe("NOT_FOUND");
 const wrong=await page.request.post(`/api/students/${randomUUID()}/billing-assignments`,{
  headers:{origin},data:input,
 });
 expect(wrong.status()).toBe(400);
 const readOnly=await delegatedTool(page,request,"coach:read");
 const tools=await readOnly.listTools();
 expect(tools.some((x:{name:string})=>x.name==="ccp_student_billing_assignments_list")).toBe(true);
 expect(tools.some((x:{name:string})=>x.name==="ccp_student_billing_assignments_create")).toBe(false);
 await page.goto(`/students/${studentId}`);
 await expect(page.getByTestId("payer-workplace")).toHaveValue(workplaceId);
});

test("PARITY:PARITY-student-payer-denies inferred debt and foreign payer",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const invalid=await call("ccp_student_billing_assignments_create",{
  studentId:randomUUID(),workplaceId:randomUUID(),billingAccountId:randomUUID(),
  effectiveFrom:"2047-02-01",effectiveTo:null,idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(invalid.error?.code).toBe("NOT_FOUND");
 const withoutApproval=await call("ccp_student_billing_assignments_create",{
  studentId:randomUUID(),workplaceId:randomUUID(),billingAccountId:randomUUID(),
  effectiveFrom:"2047-02-01",effectiveTo:null,idempotencyKey:randomUUID(),confirmed:false,
 });
 expect(withoutApproval.error?.code).toBe("VALIDATION_ERROR");
});
