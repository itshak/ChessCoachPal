import {randomUUID} from "node:crypto";
import {expect} from "@playwright/test";
import {isolatedTeacherTest as test} from "./helpers/isolated-teacher";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-earnings-summary displays exact posted, applied and outstanding amounts and rejects stale approval",async({page,request,browser,isolatedTeacher})=>{
  test.setTimeout(120_000);
  const call=await delegatedTool(page,request,"coach:read coach:write",isolatedTeacher);
  const origin=new URL(page.url()).origin;
  const workplace=await call("ccp_workplaces_create",{
    name:"Synthetic reconciliation school "+randomUUID(),timezone:"Asia/Jerusalem",
    currency:"ILS",locale:"he",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=String(workplace.data.entityId);
  const account=await call("ccp_billing_accounts_create",{
    displayName:"Synthetic school account "+randomUUID(),accountKind:"organization",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(account.error).toBeUndefined();
  const billingAccountId=String(account.data.id);
  const studentIds:string[]=[];
  for(let i=0;i<2;i++){
    const student=await call("ccp_students_create",{
      name:"Reconciliation learner "+randomUUID(),idempotencyKey:randomUUID(),
    });
    expect(student.error).toBeUndefined();
    const studentId=String(student.data.entityId);
    studentIds.push(studentId);
    expect((await call("ccp_workplaces_enroll",{
      studentId,workplaceId,idempotencyKey:randomUUID(),
    })).error).toBeUndefined();
  }
  const lessons=[];
  for(const day of ["05","12","19","26"]){
    const date="2047-02-"+day;
    const lesson=await call("ccp_lessons_capture_completed",{
      workplaceId,studentIds,title:"Synthetic completed reconciliation lesson",
      startsAt:date+"T09:00:00+02:00",durationMinutes:90,
      attendance:studentIds.map(studentId=>({studentId,status:"present",note:""})),
      requestId:randomUUID(),confirmed:true,
    });
    expect(lesson.error).toBeUndefined();
    lessons.push({date,sessionId:String(lesson.data.sessionId)});
  }
  const agreement=await call("ccp_compensation_agreements_create",{
    workplaceId,billingAccountId,agreementRole:"coach_earning",model:"hourly",
    rateCents:14000,currency:"ILS",effectiveFrom:"2047-02-01",
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(agreement.error).toBeUndefined();
  const agreementId=String(agreement.data.id);
  const scope={agreementId,from:"2047-02-01",to:"2047-02-28"};
  const preview=await call("ccp_compensation_agreements_preview",scope);
  expect(preview.error).toBeUndefined();
  expect(preview.data.projection).toMatchObject({eligibleSessionCount:4,expectedCents:84000});
  const revision=await call("ccp_compensation_agreements_update",{
    id:agreementId,expectedRevision:1,changes:{rateCents:12000},
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(revision.error).toBeUndefined();
  expect(revision.data).toMatchObject({revision:2,billingAccountId,rateCents:12000});

  const readback=async()=>{
    const response=await page.request.get("/api/finance-ledger");
    expect(response.status(),await response.text()).toBe(200);
    const web=await response.json();
    const mcp=await call("ccp_finance_ledger_list",{});
    expect(mcp.error).toBeUndefined();
    expect(web).toEqual(mcp.data);
    return {
      obligations:(web.obligations as {id:string;workplace_id:string;amount_cents:number;session_id:string;billing_account_id:string}[]).filter(row=>row.workplace_id===workplaceId),
      payments:(web.receivedPayments as {id:string;billing_account_id:string;amount_cents:number}[]).filter(row=>row.billing_account_id===billingAccountId),
      allocations:web.allocations as {obligation_id:string;received_payment_id:string;amount_cents:number}[],
    };
  };
  const reportScope={workplaceId,from:scope.from,to:scope.to,currency:"ILS",billingAccountId};
  const reportPath="/api/finance-ledger/earnings-summary?"+new URLSearchParams(reportScope);
  async function report(expected:Record<string,number>){
    const web=await page.request.get(reportPath);
    expect(web.status(),await web.text()).toBe(200);
    expect(web.headers()["cache-control"]).toBe("no-store");
    const mcp=await call("ccp_finance_earning_summary",reportScope);
    expect(mcp.error).toBeUndefined();
    expect(mcp.data).toEqual(await web.json());
    expect(mcp.data).toMatchObject({...reportScope,...expected});
  }
  await report({obligationCount:0,correctedPostedCents:0,netAllocatedReceivedCents:0,outstandingCents:0});
  expect((await request.get(reportPath)).status()).toBe(401);
  const invalid=await page.request.get(reportPath+"&currency=USD");
  expect(invalid.status()).toBe(400);
  expect(invalid.headers()["cache-control"]).toBe("no-store");
  const unavailable={...reportScope,workplaceId:randomUUID()};
  const wrongVenue=await page.request.get("/api/finance-ledger/earnings-summary?"+new URLSearchParams(unavailable));
  expect(wrongVenue.status()).toBe(403);
  expect((await call("ccp_finance_earning_summary",unavailable)).error?.code).toBe("EARNINGS_SUMMARY_SCOPE_NOT_OWNED");
  const before=await readback();
  expect(before.obligations).toEqual([]);
  expect(before.payments).toEqual([]);
  const [first]=lessons;
  const stale=await call("ccp_finance_obligation_approve",{
    agreementId,expectedRevision:preview.data.agreement.revision,expectedAmountCents:21000,
    sessionId:first.sessionId,studentId:null,periodStart:first.date,periodEnd:first.date,
    idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(stale.error?.code).toBe("STALE_AGREEMENT_REVISION");
  const afterStale=await readback();
  expect(afterStale.obligations).toEqual([]);
  expect(afterStale.payments).toEqual([]);

  const response=await page.request.get(`/api/compensation-agreements/${agreementId}/preview?from=${scope.from}&to=${scope.to}`);
  expect(response.status(),await response.text()).toBe(200);
  const fresh=await response.json();
  expect(fresh.projection).toMatchObject({eligibleSessionCount:4,expectedCents:72000,currency:"ILS"});
  for(const lesson of lessons){
    const posted=await call("ccp_finance_obligation_approve",{
      agreementId,expectedRevision:fresh.agreement.revision,expectedAmountCents:18000,
      sessionId:lesson.sessionId,studentId:null,periodStart:lesson.date,periodEnd:lesson.date,
      idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(posted.error).toBeUndefined();
    expect(posted.data.obligation).toMatchObject({agreement_revision:2,billing_account_id:billingAccountId,session_id:lesson.sessionId,amount_cents:18000,currency:"ILS"});
  }
  // These four known scoped fixture rows fit in the list, not a claim of an aggregate product report.
  const unpaid=await readback();
  expect(unpaid.obligations).toHaveLength(4);
  expect(unpaid.obligations.map(row=>row.session_id).sort()).toEqual(lessons.map(x=>x.sessionId).sort());
  expect(unpaid.obligations.reduce((sum,row)=>sum+row.amount_cents,0)).toBe(72000);
  expect(unpaid.payments).toEqual([]);
  await report({obligationCount:4,grossPostedCents:72000,correctedPostedCents:72000,netAllocatedReceivedCents:0,outstandingCents:72000});
  await page.goto("/billing");
  const panel=page.getByRole("region",{name:"Posted coaching earnings"});
  await expect(panel.getByRole("status")).toBeEmpty();
  await panel.getByLabel("Workplace for earnings").selectOption(workplaceId);
  await panel.getByLabel("Billing account for earnings").selectOption(billingAccountId);
  await panel.getByLabel("First lesson date").fill(reportScope.from);
  await panel.getByLabel("Last lesson date").fill(reportScope.to);
  await panel.getByLabel("Earnings currency (three letters)").fill("ILS");
  const runReport=panel.getByRole("button",{name:"Show posted earnings"});
  const balance=(label:string)=>panel.locator("dl > div").filter({has:page.getByText(label,{exact:true})}).locator("dd");
  await runReport.focus();
  await page.keyboard.press("Enter");
  await expect(balance("Outstanding earnings")).toHaveText(/ILS\s+720\.00/);
  await expect(balance("Applied receipts")).toHaveText(/ILS\s+0\.00/);
  await panel.getByLabel("Earnings currency (three letters)").fill("USD");
  await expect(balance("Outstanding earnings")).toHaveCount(0);
  await runReport.click();
  await expect(panel.getByRole("status")).toHaveText("No posted lessons match these filters");
  await panel.getByLabel("Earnings currency (three letters)").fill("ILS");
  const obligationIds=new Set(unpaid.obligations.map(row=>row.id));
  expect(unpaid.allocations.filter(row=>obligationIds.has(row.obligation_id))).toEqual([]);

  const recorded=await page.request.post("/api/finance-ledger/payments",{
    headers:{origin},data:{
      billingAccountId,currency:"ILS",amountCents:72000,receivedAt:new Date().toISOString(),
      method:"bank_transfer",externalReference:"Synthetic existing offline receipt "+randomUUID(),
      idempotencyKey:randomUUID(),confirmed:true,
    },
  });
  expect(recorded.status(),await recorded.text()).toBe(201);
  const paymentId=String((await recorded.json()).payment.id);
  const unallocated=await readback();
  expect(unallocated.payments).toEqual([expect.objectContaining({id:paymentId,amount_cents:72000})]);
  expect(unallocated.allocations.filter(row=>obligationIds.has(row.obligation_id))).toEqual([]);
  await report({netAllocatedReceivedCents:0,outstandingCents:72000});
  let firstAllocationId:string|null=null;
  for(const [index,obligation] of unpaid.obligations.entries()){
    const allocation=await call("ccp_finance_allocation_record",{
      receivedPaymentId:paymentId,obligationId:obligation.id,amountCents:18000,
      idempotencyKey:randomUUID(),confirmed:true,
    });
    expect(allocation.error).toBeUndefined();
    if(index===0){
      firstAllocationId=String(allocation.data.allocation.id);
      await report({netAllocatedReceivedCents:18000,outstandingCents:54000});
    }
  }
  await report({netAllocatedReceivedCents:72000,outstandingCents:0});
  await runReport.click();
  await expect(balance("Outstanding earnings")).toHaveText(/ILS\s+0\.00/);
  await expect(balance("Applied receipts")).toHaveText(/ILS\s+720\.00/);
  const settled=await readback();
  expect(settled.obligations).toEqual(unpaid.obligations);
  expect(settled.payments).toEqual(unallocated.payments);
  const allocated=settled.allocations.filter(row=>obligationIds.has(row.obligation_id));
  expect(allocated).toHaveLength(4);
  for(const id of obligationIds){
    expect(allocated.filter(row=>row.obligation_id===id)).toEqual([
      expect.objectContaining({received_payment_id:paymentId,amount_cents:18000}),
    ]);
  }
  expect(firstAllocationId).not.toBeNull();
  expect((await call("ccp_finance_reversal_record",{
    kind:"allocation_reversal",targetId:firstAllocationId,amountCents:5000,
    reason:"Synthetic correction of original allocation",idempotencyKey:randomUUID(),confirmed:true,
  })).error).toBeUndefined();
  expect((await call("ccp_finance_reversal_record",{
    kind:"obligation_correction",targetId:unpaid.obligations[0].id,amountCents:2000,
    reason:"Synthetic correction of remaining obligation",idempotencyKey:randomUUID(),confirmed:true,
  })).error).toBeUndefined();
  await report({grossPostedCents:72000,correctionCents:2000,correctedPostedCents:70000,
    netAllocatedReceivedCents:67000,outstandingCents:3000});
  const readOnlyPage=await browser.newPage({baseURL:origin});
  try{
    const readOnly=await delegatedTool(readOnlyPage,request,"coach:read",isolatedTeacher);
    expect((await readOnly.listTools()).some(x=>x.name==="ccp_finance_earning_summary")).toBe(true);
    expect((await readOnly("ccp_finance_earning_summary",reportScope)).data)
      .toMatchObject({netAllocatedReceivedCents:67000,outstandingCents:3000});
  }finally{await readOnlyPage.close();}
});
