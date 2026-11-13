import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

type Call=(name:string,args:Record<string,unknown>)=>Promise<any>;
async function billableLesson(page:import("@playwright/test").Page,call:Call,month:string){
  const student=await call("ccp_v1_students_create",{
    name:"Finance parity learner "+randomUUID(),idempotencyKey:randomUUID(),
  });
  expect(student.error).toBeUndefined();
  const studentId=student.data.entityId as string;
  const guardian=await call("ccp_v1_guardians_create",{
    name:"Finance parity household "+randomUUID(),studentIds:[studentId],confirmed:true,
  });
  expect(guardian.error).toBeUndefined();
  const rate=await page.request.put("/api/students/"+studentId,{
    data:{defaultRateCents:6200},
  });
  expect(rate.status(),await rate.text()).toBe(200);
  const workplace=await call("ccp_v1_workplaces_create",{
    name:"Finance parity workplace "+randomUUID(),timezone:"UTC",
    currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID(),
  });
  expect(workplace.error).toBeUndefined();
  const workplaceId=workplace.data.entityId as string;
  const enrolled=await call("ccp_v1_workplaces_enroll",{
    workplaceId,studentId,idempotencyKey:randomUUID(),
  });
  expect(enrolled.error).toBeUndefined();
  const lesson=await call("ccp_v1_sessions_create",{
    workplaceId,studentId,title:"Finance parity lesson",
    startsAt:month+"-15T13:15:00Z",durationMinutes:60,
    lessonNote:"",idempotencyKey:randomUUID(),
  });
  expect(lesson.error).toBeUndefined();
  const sessionId=lesson.data.entityId as string;
  const attendance=await call("ccp_v1_session_attendance_set",{
    sessionId,studentId,status:"present",note:"",
    noticeAt:null,cancelReason:"",expectedUpdatedAt:null,
    notifyFamily:false,idempotencyKey:randomUUID(),confirmed:true,
  });
  expect(attendance.error).toBeUndefined();
  return {studentId,sessionId,period:{
    periodStart:month+"-01",periodEnd:month+"-28",
  }};
}

test("PARITY:PARITY-billing-generation-receipt-replay creates one invoice under simultaneous website and MCP commit",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const {period,sessionId,studentId}=await billableLesson(page,call,"2057-04");
  const previewSite=await page.request.post("/api/billing/generate",{
    data:{...period,commit:false},
  });
  expect(previewSite.status(),await previewSite.text()).toBe(200);
  const preview=await previewSite.json();
  expect(preview.totalCents).toBe(6200);
  const previewTool=await call("ccp_v1_billing_generation_preview",period);
  expect(previewTool.error).toBeUndefined();
  expect(previewTool.data).toEqual(preview);
  const key=randomUUID();
  const [web,agent]=await Promise.all([
    page.request.post("/api/billing/generate",{
      data:{...period,commit:true,idempotencyKey:key},
    }),
    call("ccp_v1_billing_generation_commit",{
      ...period,idempotencyKey:key,confirmed:true,
    }),
  ]);
  expect(web.status(),await web.text()).toBe(200);
  expect(agent.error).toBeUndefined();
  const webResult=await web.json();
  expect(webResult.count).toBe(1);
  expect(webResult.created).toHaveLength(1);
  expect(webResult.created).toEqual(agent.data.created);
  expect(webResult.idempotencyKey).toBe(key);
  expect(agent.data.idempotencyKey).toBe(key);
  expect(Number(Boolean(webResult.replayed))+Number(Boolean(agent.data.replayed))).toBe(1);
  const invoiceId=webResult.created[0] as string;
  const invoiceSite=await page.request.get("/api/billing/invoices/"+invoiceId);
  expect(invoiceSite.status(),await invoiceSite.text()).toBe(200);
  const invoice=await invoiceSite.json();
  expect(invoice.invoice_items).toHaveLength(1);
  expect(invoice.invoice_items[0]).toMatchObject({
    session_id:sessionId,student_id:studentId,
  });

  const retry=await call("ccp_v1_billing_generation_commit",{
    ...period,idempotencyKey:key,confirmed:true,
  });
  expect(retry.error).toBeUndefined();
  expect(retry.data).toMatchObject({replayed:true,created:[invoiceId]});
  const foreignPeriod=await page.request.post("/api/billing/generate",{
    data:{periodStart:"2057-05-01",periodEnd:"2057-05-31",
      commit:true,idempotencyKey:key},
  });
  expect(foreignPeriod.status(),await foreignPeriod.text()).toBe(409);
  const reuseOtherAction=await call("ccp_v1_billing_invoice_regenerate",{
    invoiceId,expectedUpdatedAt:invoice.updated_at,
    idempotencyKey:key,confirmed:true,
  });
  expect(reuseOtherAction.error?.code).toBe("CONFLICT");
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
  const lines=await admin.from("invoice_items").select("invoice_id,session_id,student_id")
    .eq("session_id",sessionId).eq("student_id",studentId);
  expect(lines.error).toBeNull();
  expect(lines.data).toEqual([{invoice_id:invoiceId,session_id:sessionId,student_id:studentId}]);
  const malformed=await page.request.post("/api/billing/generate",{
    data:{...period,commit:"true",idempotencyKey:randomUUID()},
  });
  expect(malformed.status()).toBe(400);
});

test("PARITY:PARITY-billing-regeneration-receipt-revision is transactional and replayable across both clients",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const {period,studentId,sessionId}=await billableLesson(page,call,"2058-04");
  const generated=await page.request.post("/api/billing/generate",{
    data:{...period,commit:true,idempotencyKey:randomUUID()},
  });
  expect(generated.status(),await generated.text()).toBe(200);
  const invoiceId=(await generated.json()).created[0] as string;
  const get=async()=> {
    const response=await page.request.get("/api/billing/invoices/"+invoiceId);
    expect(response.status(),await response.text()).toBe(200);
    return await response.json() as Record<string,any>;
  };
  const first=await get();
  expect(first.subtotal_cents).toBe(6200);
  expect((await page.request.put("/api/students/"+studentId,{
    data:{defaultRateCents:8800},
  })).status()).toBe(200);
  const key=randomUUID();
  const payload={expectedUpdatedAt:first.updated_at,idempotencyKey:key};
  const [web,agent]=await Promise.all([
    page.request.post("/api/billing/invoices/"+invoiceId+"/regenerate",{
      data:payload,
    }),
    call("ccp_v1_billing_invoice_regenerate",{
      invoiceId,...payload,confirmed:true,
    }),
  ]);
  expect(web.status(),await web.text()).toBe(200);
  expect(agent.error).toBeUndefined();
  const webResult=await web.json();
  expect(webResult.subtotalCents).toBe(8800);
  expect(agent.data.subtotalCents).toBe(8800);
  expect(webResult.updatedAt).toBe(agent.data.updatedAt);
  expect(Number(Boolean(webResult.replayed))+Number(Boolean(agent.data.replayed))).toBe(1);
  const saved=await get();
  expect(saved.subtotal_cents).toBe(8800);
  expect(saved.invoice_items).toHaveLength(1);
  expect(saved.invoice_items[0]).toMatchObject({
    session_id:sessionId,student_id:studentId,
  });

  expect((await page.request.put("/api/students/"+studentId,{
    data:{defaultRateCents:9900},
  })).status()).toBe(200);
  const sameReceipt=await page.request.post(
    "/api/billing/invoices/"+invoiceId+"/regenerate",{data:payload});
  expect(sameReceipt.status(),await sameReceipt.text()).toBe(200);
  const sameResult=await sameReceipt.json();
  expect(sameResult).toMatchObject({replayed:true,subtotalCents:8800});
  expect(Date.parse(sameResult.updatedAt)).toBe(Date.parse(saved.updated_at));
  expect((await get()).subtotal_cents).toBe(8800);
  const stale=await call("ccp_v1_billing_invoice_regenerate",{
    invoiceId,expectedUpdatedAt:first.updated_at,idempotencyKey:randomUUID(),
    confirmed:true,
  });
  expect(stale.error?.code).toBe("CONFLICT");
  const fixed=await call("ccp_v1_billing_invoice_regenerate",{
    invoiceId,expectedUpdatedAt:saved.updated_at,idempotencyKey:randomUUID(),
    confirmed:true,
  });
  expect(fixed.error).toBeUndefined();
  expect(fixed.data.subtotalCents).toBe(9900);
  expect((await get()).subtotal_cents).toBe(9900);
  const invalidWeb=await page.request.post(
    "/api/billing/invoices/"+invoiceId+"/regenerate",{
      data:{expectedUpdatedAt:saved.updated_at,providerSecret:"do-not-accept"},
    });
  expect(invalidWeb.status()).toBe(400);
  const invalidMcp=await call("ccp_v1_billing_invoice_regenerate",{
    invoiceId,confirmed:true,providerSecret:"do-not-accept",
  });
  expect(invalidMcp.error?.code).toBe("VALIDATION_ERROR");
});
