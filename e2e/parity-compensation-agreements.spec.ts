import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
const origin=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;

test("PARITY:PARITY-compensation-agreements exact scopes, 8-pupil group counted once and web/MCP readback",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const workplace=await call("ccp_workplaces_create",{
  name:"Compensation school "+randomUUID(),timezone:"Asia/Jerusalem",
  currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const counterparty=await call("ccp_billing_accounts_create",{
  displayName:"Compensation school finance "+randomUUID(),
  accountKind:"organization",idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(counterparty.error).toBeUndefined();
 const counterpartyId=counterparty.data.id as string;
 const studentIds:string[]=[];
 for(let i=0;i<8;i++){
  const student=await call("ccp_students_create",{
   name:"Group student "+i+" "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  studentIds.push(studentId);
  expect((await call("ccp_workplaces_enroll",{
   studentId,workplaceId,idempotencyKey:randomUUID(),
  })).error).toBeUndefined();
 }
 const completed=await call("ccp_lessons_capture_completed",{
  workplaceId,studentIds,title:"90-minute group session "+randomUUID(),
  startsAt:"2046-02-05T09:00:00+02:00",durationMinutes:90,
  lessonNote:"One group session, no inferred mastery or payments",
  attendance:studentIds.map(studentId=>({studentId,status:"present",note:""})),
  requestId:randomUUID(),confirmed:true,
 });
 expect(completed.error).toBeUndefined();
 expect(completed.data).toMatchObject({status:"completed",participantCount:8,
  instructorMinutes:90,replayed:false});
 const requestId=randomUUID();
 const input={idempotencyKey:requestId,workplaceId,agreementRole:"coach_earning",
  model:"hourly",rateCents:12000,currency:"ILS",billingAccountId:counterpartyId,
  effectiveFrom:"2046-01-01",
  effectiveTo:null,confirmed:true};
 const created=await call("ccp_compensation_agreements_create",input);
 expect(created.error).toBeUndefined();
 expect(created.data).toMatchObject({workplaceId,model:"hourly",rateCents:12000,
  agreementRole:"coach_earning",billingAccountId:counterpartyId,replayed:false});
 const id=created.data.id as string;
 const website=await page.request.get("/api/compensation-agreements?workplaceId="+workplaceId);
 expect(website.status(),await website.text()).toBe(200);
 const mcp=await call("ccp_compensation_agreements_list",{workplaceId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(await website.json());
 const details=await page.request.get("/api/compensation-agreements/"+id);
 expect(details.status(),await details.text()).toBe(200);
 const detailsBody=await details.json();
 expect(detailsBody).not.toHaveProperty("last_request_hash");
 expect(detailsBody).not.toHaveProperty("private_series_id");
 expect((await call("ccp_compensation_agreements_get",{agreementId:id})).data)
   .toEqual(detailsBody);
 const q=new URLSearchParams({from:"2046-02-01",to:"2046-02-28"});
 const webPreview=await page.request.get(`/api/compensation-agreements/${id}/preview?${q}`);
 expect(webPreview.status(),await webPreview.text()).toBe(200);
 const summary=await webPreview.json();
 expect(summary.projection).toMatchObject({
  eligibleSessionCount:1,eligibleInstructorMinutes:90,
  eligibleParticipantCount:8,expectedCents:18000,currency:"ILS",
 });
 expect(summary).toMatchObject({persistedObligation:false,paymentRecorded:false});
 expect((await call("ccp_compensation_agreements_preview",{
   agreementId:id,from:"2046-02-01",to:"2046-02-28",
 })).data).toEqual(summary);
 const retry=await page.request.post("/api/compensation-agreements",{
  headers:{origin},data:input,
 });
 expect(retry.status(),await retry.text()).toBe(201);
 expect((await retry.json()).replayed).toBe(true);
 const overlap=await call("ccp_compensation_agreements_create",{
  ...input,idempotencyKey:randomUUID(),
 });
 expect(overlap.error?.code).toBe("AGREEMENT_CONFLICT");
 const changed=await call("ccp_compensation_agreements_update",{
  id,expectedRevision:1,changes:{rateCents:10000},
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(changed.error).toBeUndefined();
 expect(changed.data.rateCents).toBe(10000);
 const newProjection=await page.request.get(`/api/compensation-agreements/${id}/preview?${q}`);
 expect(newProjection.status(),await newProjection.text()).toBe(200);
 expect((await newProjection.json()).projection.expectedCents).toBe(15000);
 const unauthorized=await call("ccp_compensation_agreements_get",{
  agreementId:randomUUID(),
 });
 expect(unauthorized.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-compensation-agreements do not invent missing payer, salary month or external payment",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const place=await call("ccp_workplaces_create",{
  name:"Private school "+randomUUID(),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:randomUUID(),
 });
 expect(place.error).toBeUndefined();
 const workplaceId=place.data.entityId as string;
 const counterparty=await call("ccp_billing_accounts_create",{
  displayName:"Monthly school sponsor "+randomUUID(),accountKind:"organization",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(counterparty.error).toBeUndefined();
 const counterpartyId=counterparty.data.id as string;
 const refused=await call("ccp_compensation_agreements_create",{
  workplaceId,agreementRole:"participant_charge",model:"per_student",
  rateCents:5000,currency:"USD",effectiveFrom:"2046-01-01",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(refused.error?.code).toBe("VALIDATION_ERROR");
 const noCoachPayer=await call("ccp_compensation_agreements_create",{
  workplaceId,agreementRole:"coach_earning",model:"hourly",
  rateCents:12000,currency:"USD",effectiveFrom:"2046-01-01",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(noCoachPayer.error?.code).toBe("VALIDATION_ERROR");
 const agreement=await call("ccp_compensation_agreements_create",{
  workplaceId,agreementRole:"coach_earning",model:"fixed_period",
  rateCents:750000,currency:"USD",billingAccountId:counterpartyId,
  effectiveFrom:"2046-01-01",
  idempotencyKey:randomUUID(),confirmed:true,
 });
 expect(agreement.error).toBeUndefined();
 const id=agreement.data.id as string;
 const month=await call("ccp_compensation_agreements_preview",{
  agreementId:id,from:"2046-02-01",to:"2046-02-28",
 });
 expect(month.error).toBeUndefined();
 expect(month.data.projection.expectedCents).toBe(750000);
 expect(month.data.persistedObligation).toBe(false);
 const week=await call("ccp_compensation_agreements_preview",{
  agreementId:id,from:"2046-02-01",to:"2046-02-07",
 });
 expect(week.error?.code).toBe("FIXED_PERIOD_MONTH_REQUIRED");
 const readOnly=await delegatedTool(page,request,"coach:read");
 const tools=await readOnly.listTools();
 expect(tools.some((x:{name:string})=>x.name==="ccp_compensation_agreements_preview")).toBe(true);
 expect(tools.some((x:{name:string})=>x.name==="ccp_compensation_agreements_create")).toBe(false);
});
