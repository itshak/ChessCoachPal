import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY: legacy compensation does not reinterpret private recurring terms",async({page,request})=>{
 test.setTimeout(120_000);
 const call=await delegatedTool(page,request);
 const origin=new URL(page.url()).origin;
 const headers={origin};
 const signed=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const login=await signed.auth.signInWithPassword({email:"teacher@example.com",password:"password123"});
 expect(login.error).toBeNull();
 const teacherId=login.data.user!.id;
 const run=async(tool:string,args:Record<string,unknown>)=>{
  const result=await call(tool,args);expect(result.error,tool).toBeUndefined();return result.data;
 };
 const key=()=>({idempotencyKey:randomUUID(),confirmed:true as const});
 const day="2059-12-01",end="2059-12-08";
 const workplaceId=(await run("ccp_workplaces_create",{name:"Bridge venue "+randomUUID(),
  timezone:"UTC",currency:"USD",locale:"en",policy:{},idempotencyKey:randomUUID()})).entityId;
 const studentId=(await run("ccp_students_create",{name:"Bridge pupil "+randomUUID(),idempotencyKey:randomUUID()})).entityId;
 await run("ccp_workplaces_enroll",{studentId,workplaceId,idempotencyKey:randomUUID()});
 const billingAccountId=(await run("ccp_billing_accounts_create",{displayName:"Synthetic bridge payer "+randomUUID(),
  accountKind:"organization",...key()})).id;
 const base={workplaceId,billingAccountId,currency:"USD",model:"per_session",
  agreementRole:"coach_earning",rateCents:10000,effectiveFrom:day,effectiveTo:end};
 const broad=(await run("ccp_compensation_agreements_create",{...base,...key()})).id;
 const normalRow=await signed.from("compensation_agreements").select("*").eq("id",broad).single();
 expect(normalRow.error).toBeNull();
 const pending=process.env.E2E_PRIVATE_SERIES_PENDING_SCHEMA==="1";
 expect(Object.prototype.hasOwnProperty.call(normalRow.data,"private_series_id")).toBe(pending);
 const slot=await signed.from("lesson_slots").insert({teacher_id:teacherId,student_id:studentId,
  workplace_id:workplaceId,start_date:day,end_date:end,day_of_week:new Date(day+"T00:00:00Z").getUTCDay(),
  start_time:"10:00",duration_minutes:60}).select("id").single();
 expect(slot.error).toBeNull();
 const mat=await signed.rpc("ccp_canonical_slot_materialize",{p_rows:[day,end].map(date=>({
  slot_id:slot.data!.id,teacher_id:teacherId,workplace_id:workplaceId,student_id:studentId,
  slot_occurrence_date:date,starts_at:date+"T10:00:00Z",local_timezone:"UTC",duration_minutes:60,
  is_home_visit:false,
 }))});
 expect(mat.error,JSON.stringify(mat.error)).toBeNull();
 const saved=await signed.from("teaching_sessions").select("id,slot_occurrence_date").eq("slot_id",slot.data!.id);
 expect(saved.error).toBeNull();
 const [target,override]=[day,end].map(date=>saved.data!.find(row=>row.slot_occurrence_date===date)!.id);
 const extra=(await run("ccp_sessions_create",{studentId,workplaceId,title:"Unrelated bridge control",
  startsAt:day+"T14:00:00Z",durationMinutes:60,idempotencyKey:randomUUID()})).entityId;
 for(const sessionId of [target,override,extra]){
  const details=await run("ccp_sessions_details",{sessionId}),roster=await run("ccp_attendance_preview",{sessionId});
  await run("ccp_sessions_complete",{sessionId,expectedUpdatedAt:details.updated_at,...key(),
    attendance:roster.attendance.map((a:{student_id:string;updated_at:string})=>({studentId:a.student_id,
    status:"present",note:"Synthetic",expectedUpdatedAt:a.updated_at}))});
 }
 const exact=(await run("ccp_compensation_agreements_create",{...base,exactSessionId:override,
  effectiveFrom:end,effectiveTo:end,rateCents:15000,...key()})).id;
 const url=(id:string)=>"/api/compensation-agreements/"+id;
 const preview=(id:string,from=day,to=end)=>page.request.get(url(id)+"/preview?"+new URLSearchParams({from,to}));
 const broadBaseline=await preview(broad);
 expect(broadBaseline.status(),await broadBaseline.text()).toBe(200);
 expect((await broadBaseline.json()).projection.expectedCents).toBe(20000);
 const approve=(agreementId:string,sessionId:string,amount:number,date:string)=>({agreementId,sessionId,
  expectedAmountCents:amount,expectedRevision:1,periodStart:date,periodEnd:date,...key()});
 if(pending){
  const fresh=await signed.rpc("ccp_private_series_compensation_commit",{p_workplace:workplaceId,p_series:slot.data!.id,
    p_payer:billingAccountId,p_model:"per_session",p_rate:22000,p_currency:"USD",p_from:day,p_to:end,
    p_archive:null,p_revision:null,p_request:randomUUID(),p_confirmed:true});
  expect(fresh.error,JSON.stringify(fresh.error)).toBeNull();
  const seriesId=fresh.data.agreementId as string;
  const list=await run("ccp_compensation_agreements_list",{workplaceId});
  const listWeb=await page.request.get("/api/compensation-agreements?workplaceId="+workplaceId);
  expect(listWeb.status()).toBe(200);
  expect(await listWeb.json()).toEqual(list);
  expect(list.map((a:{id:string})=>a.id)).not.toContain(seriesId);
  const unsupported="PRIVATE_SERIES_TERMS_UNAVAILABLE";
  for(const [response,tool,args] of [
   [await page.request.get(url(seriesId)),"ccp_compensation_agreements_get",{agreementId:seriesId}],
   [await preview(seriesId),"ccp_compensation_agreements_preview",{agreementId:seriesId,from:day,to:end}],
   [await page.request.patch(url(seriesId),{headers,data:{id:seriesId,expectedRevision:1,changes:{rateCents:1},...key()}}),
    "ccp_compensation_agreements_update",{id:seriesId,expectedRevision:1,changes:{rateCents:1},...key()}],
   [await page.request.post("/api/finance-ledger/obligations",{headers,data:approve(seriesId,target,22000,day)}),
    "ccp_finance_obligation_approve",approve(seriesId,target,22000,day)],
  ] as const){
   expect(response.status(),await response.text()).toBe(409);
   expect((await response.json()).code).toBe(unsupported);
   expect((await call(tool,args)).error?.code).toBe(unsupported);
  }
  const unavailable=await preview(broad);
  expect(unavailable.status(),await unavailable.text()).toBe(409);
  expect((await unavailable.json()).code).toBe("PRIVATE_SERIES_PREVIEW_UNAVAILABLE");
  expect((await call("ccp_compensation_agreements_preview",{agreementId:broad,from:day,to:end})).error?.code)
    .toBe("PRIVATE_SERIES_PREVIEW_UNAVAILABLE");
  expect((await call("ccp_finance_obligation_approve",approve(broad,target,10000,day))).error?.code)
    .toBe("PRIVATE_SERIES_AGREEMENT_REVIEW_REQUIRED");
  const none=await signed.from("financial_obligations").select("id").eq("session_id",target);
  expect(none.error).toBeNull();expect(none.data).toHaveLength(0);
 }
 const exactWeb=await preview(exact,end,end);expect(exactWeb.status(),await exactWeb.text()).toBe(200);
 const exactMCP=await run("ccp_compensation_agreements_preview",{agreementId:exact,from:end,to:end});
 expect(await exactWeb.json()).toEqual(exactMCP);
 expect(exactMCP.projection.expectedCents).toBe(15000);
 expect((await run("ccp_finance_obligation_approve",approve(exact,override,15000,end))).obligation.amount_cents).toBe(15000);
 const broadUnrelated=await page.request.post("/api/finance-ledger/obligations",{headers,data:approve(broad,extra,10000,day)});
 expect(broadUnrelated.status(),await broadUnrelated.text()).toBe(201);
 expect((await broadUnrelated.json()).obligation.amount_cents).toBe(10000);
});
