import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

const teacherId="00000000-0000-0000-0000-000000000001";
async function draftInvoice(){
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
 const name="Atomic invoice family "+randomUUID().slice(0,8);
 const {data:guardian,error:guardianError}=await admin.from("guardians")
   .insert({teacher_id:teacherId,name,portal_token:randomUUID()}).select("id").single();
 expect(guardianError).toBeNull();
 const {data:invoice,error:invoiceError}=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian!.id,period_start:"2041-05-01",
   period_end:"2041-05-31",status:"draft",subtotal_cents:1400,
   currency:"ILS",notes:"Before replacement",
 }).select("id,updated_at").single();
 expect(invoiceError).toBeNull();
 const {error:lineError}=await admin.from("invoice_items").insert({
   invoice_id:invoice!.id,lesson_id:null,kind:"lesson",
   description:"Original line",quantity:1,unit_cents:1400,
   amount_cents:1400,sort_order:0,
 });
 expect(lineError).toBeNull();
 return {id:invoice!.id,updatedAt:invoice!.updated_at as string,admin};
}
async function websiteInvoice(page:import("@playwright/test").Page,id:string){
 const r=await page.request.get("/api/billing/invoices/"+id);
 expect(r.status(),await r.text()).toBe(200);
 return await r.json() as {
   status:string;notes:string;subtotal_cents:number;
   updated_at:string;invoice_items:Array<{description:string;amount_cents:number}>;
 };
}

test("PARITY:PARITY-billing-invoice-edit atomically replaces draft line items",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const {id}=await draftInvoice();
 const prior=await websiteInvoice(page,id);
 expect(prior.invoice_items).toHaveLength(1);
 const made=await callTool("ccp_v1_billing_invoice_draft_update",{
   invoiceId:id,confirmed:true,changes:{
     notes:"Revised by MCP",expectedUpdatedAt:prior.updated_at,
     items:[{description:"First chess lesson",quantity:2,unitCents:700,
       amountCents:1400},
       {description:"Second chess lesson",quantity:1,unitCents:900,
       amountCents:900}],
   },
 });
 expect(made.error).toBeUndefined();
 expect(made.data.ok).toBe(true);
 const web=await websiteInvoice(page,id);
 expect(web.notes).toBe("Revised by MCP");
 expect(web.subtotal_cents).toBe(2300);
 expect(web.invoice_items.map(x=>x.description).sort()).toEqual([
   "First chess lesson","Second chess lesson",
 ].sort());
 const updated=await page.request.put("/api/billing/invoices/"+id,{
   data:{notes:"Revised by browser",items:[
     {description:"Replaced browser line",quantity:1,unitCents:500,
      amountCents:500},
   ]},
 });
 expect(updated.status(),await updated.text()).toBe(200);
 const mcpRead=await callTool("ccp_v1_billing_invoice_detail",{
   invoiceId:id,includePrivate:false,
 });
 expect(mcpRead.error).toBeUndefined();
 expect(mcpRead.data.notes).toBe("Revised by browser");
 expect(mcpRead.data.subtotal_cents).toBe(500);
 expect(mcpRead.data.invoice_items).toHaveLength(1);
 expect(mcpRead.data.invoice_items[0].description).toBe("Replaced browser line");
});

test("PARITY:PARITY-billing-invoice-revision and rollback reject foreign lesson without losing lines",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const {id,updatedAt}=await draftInvoice();
 const before=await websiteInvoice(page,id);
 const invalid=await page.request.put("/api/billing/invoices/"+id,{
   data:{notes:"Must not persist",items:[
     {description:"Valid preliminary line",quantity:1,unitCents:100,
      amountCents:100},
     {lessonId:randomUUID(),description:"Unowned lesson",
      quantity:1,unitCents:200,amountCents:200},
   ]},
 });
 expect(invalid.status()).toBe(404);
 const unchanged=await websiteInvoice(page,id);
 expect(unchanged.notes).toBe(before.notes);
 expect(unchanged.subtotal_cents).toBe(before.subtotal_cents);
 expect(unchanged.invoice_items).toHaveLength(1);
 expect(unchanged.invoice_items[0].description).toBe("Original line");
 const good=await page.request.put("/api/billing/invoices/"+id,{
   data:{notes:"Actual revision",expectedUpdatedAt:updatedAt},
 });
 expect(good.status(),await good.text()).toBe(200);
 const now=await websiteInvoice(page,id);
 expect(now.updated_at).not.toBe(updatedAt);
 const stale=await callTool("ccp_v1_billing_invoice_draft_update",{
   invoiceId:id,confirmed:true,changes:{
     notes:"Stale model overwrite",expectedUpdatedAt:updatedAt,
   },
 });
 expect(stale.error?.code).toBe("CONFLICT");
 expect((await websiteInvoice(page,id)).notes).toBe("Actual revision");
 const unknown=await callTool("ccp_v1_billing_invoice_draft_update",{
   invoiceId:randomUUID(),confirmed:true,changes:{notes:"Forbidden"},
 });
 expect(unknown.error?.code).toBe("NOT_FOUND");
 const browserUnknown=await page.request.put("/api/billing/invoices/"+randomUUID(),{
   data:{notes:"Forbidden"},
 });
 expect(browserUnknown.status()).toBe(404);
});


test("PARITY:PARITY-billing-invoice-detail-delete removes only reviewed drafts from website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const first=await draftInvoice();
 const before=await websiteInvoice(page,first.id);
 expect(before.status).toBe("draft");
 const fromMcp=await call("ccp_v1_billing_invoice_detail",{invoiceId:first.id});
 expect(fromMcp.error).toBeUndefined();
 expect(fromMcp.data.id).toBe(first.id);
 const removed=await call("ccp_v1_billing_invoice_delete",{
   invoiceId:first.id,confirmed:true,
 });
 expect(removed.error).toBeUndefined();
 expect(removed.data.ok).toBe(true);
 expect((await page.request.get("/api/billing/invoices/"+first.id)).status()).toBe(404);
 const second=await draftInvoice();
 const deleted=await page.request.delete("/api/billing/invoices/"+second.id);
 expect(deleted.status(),await deleted.text()).toBe(200);
 const modelAfter=await call("ccp_v1_billing_invoice_detail",{invoiceId:second.id});
 expect(modelAfter.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-billing-draft-idempotent-replay preserves one website/MCP revision and rejects changed-key writes",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {id}=await draftInvoice();
 const before=await websiteInvoice(page,id);
 const key=randomUUID();
 const changes={notes:"Exactly one reviewed invoice edit",expectedUpdatedAt:before.updated_at,
  idempotencyKey:key};
 const model=await call("ccp_v1_billing_invoice_draft_update",{
  invoiceId:id,changes,confirmed:true,
 });
 expect(model.error).toBeUndefined();
 expect(model.data).toMatchObject({ok:true,replayed:false,idempotencyKey:key});
 const first=await websiteInvoice(page,id);
 expect(first.notes).toBe(changes.notes);
 const replay=await page.request.put("/api/billing/invoices/"+id,{data:changes});
 expect(replay.status(),await replay.text()).toBe(200);
 expect(await replay.json()).toMatchObject({
  ok:true,replayed:true,idempotencyKey:key,updatedAt:first.updated_at,
 });
 const unchanged=await websiteInvoice(page,id);
 expect(unchanged.updated_at).toBe(first.updated_at);
 expect(unchanged.invoice_items).toEqual(first.invoice_items);
 const conflicting=await page.request.put("/api/billing/invoices/"+id,{
  data:{...changes,notes:"Different payload with same key"},
 });
 expect(conflicting.status(),await conflicting.text()).toBe(409);
 const stale=await call("ccp_v1_billing_invoice_draft_update",{
  invoiceId:id,changes:{...changes,idempotencyKey:randomUUID(),
   notes:"Should not overwrite with stale revision"},confirmed:true,
 });
 expect(stale.error?.code).toBe("CONFLICT");
 const corrected=await page.request.put("/api/billing/invoices/"+id,{data:{
  notes:"Website corrected reviewed edit",expectedUpdatedAt:first.updated_at,
  idempotencyKey:randomUUID(),
 }});
 expect(corrected.status(),await corrected.text()).toBe(200);
 const modelRead=await call("ccp_v1_billing_invoice_detail",{invoiceId:id});
 expect(modelRead.error).toBeUndefined();
 expect(modelRead.data.notes).toBe("Website corrected reviewed edit");
});

test("PARITY:PARITY-billing-draft-race-and-field-schema deduplicates concurrent writes and blocks undeclared fields",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const {id}=await draftInvoice();
 const before=await websiteInvoice(page,id);
 const changes={
  notes:"Concurrent invoice review",expectedUpdatedAt:before.updated_at,
  idempotencyKey:randomUUID(),
  items:[{description:"Synthetic chess coaching",quantity:2,
    unitCents:1700,amountCents:3400}],
 };
 const [website,agent]=await Promise.all([
  page.request.put("/api/billing/invoices/"+id,{data:changes}),
  call("ccp_v1_billing_invoice_draft_update",{
   invoiceId:id,changes,confirmed:true,
  }),
 ]);
 expect(website.status(),await website.text()).toBe(200);
 expect(agent.error).toBeUndefined();
 const webResult=await website.json();
 expect(webResult.ok).toBe(true);
 expect(agent.data.ok).toBe(true);
 expect([webResult.replayed,agent.data.replayed].filter(Boolean)).toHaveLength(1);
 const saved=await websiteInvoice(page,id);
 expect(saved.subtotal_cents).toBe(3400);
 expect(saved.invoice_items).toHaveLength(1);
 expect(saved.invoice_items[0].description).toBe("Synthetic chess coaching");
 const badWebsite=await page.request.put("/api/billing/invoices/"+id,{
  data:{notes:"Unsafe field",providerSecret:"should be rejected"},
 });
 expect(badWebsite.status(),await badWebsite.text()).toBe(400);
 const badModel=await call("ccp_v1_billing_invoice_draft_update",{
  invoiceId:id,confirmed:true,
  changes:{notes:"Unsafe field",providerSecret:"should be rejected"},
 });
 expect(badModel.error?.code).toBe("VALIDATION_ERROR");
 const unchanged=await websiteInvoice(page,id);
 expect(unchanged.updated_at).toBe(saved.updated_at);
 expect(unchanged.invoice_items).toEqual(saved.invoice_items);
});
