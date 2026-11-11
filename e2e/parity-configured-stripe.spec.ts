import {randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

type StripeCall={path:string;idempotencyKey:string;amountCents:number};
async function close(server:Server){
 await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

test("PARITY:PARITY-configured-checkout-pdf-ledger creates one safe provider session and settles by shared MCP+website",async({page,request})=>{
 test.skip(process.env.CI!=="true"||
   process.env.CCP_SYNTHETIC_STRIPE_ORIGIN!=="http://127.0.0.1:3997",
   "Requires CI-only fixed loopback Stripe test provider");

 const calls:StripeCall[]=[];
 const expired=new Set<string>();
 const stripe=createServer(async(req,res)=>{
   const path=(req.url??"").split("?")[0];
   const token=req.headers.authorization??"";
   if(!token.startsWith("Bearer sk_live_chesscoachpal_ci_")){
     res.writeHead(401);res.end();return;
   }
   if(req.method==="POST"&&path==="/v1/checkout/sessions"){
     let data="";
     for await(const chunk of req)data+=String(chunk);
     const body=new URLSearchParams(data);
     const amount=Number(body.get("line_items[0][price_data][unit_amount]"));
     if(!Number.isInteger(amount)||amount<=0||amount>50000){
       res.writeHead(400,{"Content-Type":"application/json"});
       res.end(JSON.stringify({error:{type:"invalid_request_error",message:"Invalid synthetic amount"}}));return;
     }
     const session="cs_test_ccp"+String(calls.length+1).padStart(8,"0");
     calls.push({path,idempotencyKey:String(req.headers["idempotency-key"]??""),amountCents:amount});
     res.writeHead(200,{"Content-Type":"application/json"});
     res.end(JSON.stringify({id:session,object:"checkout.session",
       status:"open",url:"https://checkout.stripe.com/c/pay/"+session}));
     return;
   }
   const match=path.match(/^\/v1\/checkout\/sessions\/(cs_test_ccp[0-9]{8})(\/expire)?$/);
   if(match&&req.method==="GET"&&!match[2]){
     res.writeHead(200,{"Content-Type":"application/json"});
     res.end(JSON.stringify({id:match[1],object:"checkout.session",
       status:expired.has(match[1])?"expired":"open"}));return;
   }
   if(match&&req.method==="POST"&&match[2]){
     expired.add(match[1]);res.writeHead(200,{"Content-Type":"application/json"});
     res.end(JSON.stringify({id:match[1],object:"checkout.session",status:"expired"}));return;
   }
   res.writeHead(404,{"Content-Type":"application/json"});
   res.end(JSON.stringify({error:{type:"invalid_request_error",message:"Synthetic route not found"}}));
 });
 await new Promise<void>((resolve,reject)=>{
   stripe.once("error",reject);stripe.listen(3997,"127.0.0.1",resolve);
 });
 let configured=false;
 try{
   const call=await delegatedTool(page,request);
   const policyResponse=await page.request.get("/api/settings/policy");
   expect(policyResponse.status(),await policyResponse.text()).toBe(200);
   const original=await policyResponse.json();
   expect(original.payment_provider).toBe("manual");
   expect(original.stripe?.secretKey?.configured).toBe(false);

   // Fake CI-only keys have no external value and are routed solely to the
   // fixed local stub. No real processor account, card or external charge.
   const secret="sk_"+"live_"+"chesscoachpal_ci_"+randomUUID().replaceAll("-","");
   const publishable="pk_"+"live_"+"chesscoachpal_ci_"+randomUUID().replaceAll("-","");
   const configure=await page.request.put("/api/settings/policy",{data:{
     paymentProvider:"stripe",stripeSecretKey:secret,stripePublishableKey:publishable,
   }});
   expect(configure.status(),await configure.text()).toBe(200);
   configured=true;
   const safePolicy=await configure.json();
   expect(safePolicy.stripe.secretKey.configured).toBe(true);
   expect(JSON.stringify(safePolicy)).not.toContain(secret);
   const mcpPolicy=await call("ccp_v1_studio_policy_get",{});
   expect(mcpPolicy.error).toBeUndefined();
   expect(JSON.stringify(mcpPolicy.data)).not.toContain(secret);

   const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
   const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
     auth:{persistSession:false,autoRefreshToken:false},
   });
   const login=await client.auth.signInWithPassword(SEED_TEACHER);
   expect(login.error).toBeNull();
   const teacherId=login.data.user!.id;
   const id=randomUUID();
   const guardian=await admin.from("guardians").insert({
     teacher_id:teacherId,name:"Checkout synthetic "+id.slice(0,8),
     email:"checkout-"+id+"@example.com",portal_token:randomUUID(),
   }).select("id").single();
   expect(guardian.error).toBeNull();
   const invoice=await admin.from("invoices").insert({
     teacher_id:teacherId,guardian_id:guardian.data!.id,status:"sent",
     period_start:"2045-04-01",period_end:"2045-04-30",
     currency:"USD",subtotal_cents:4800,
   }).select("id").single();
   expect(invoice.error).toBeNull();
   const invoiceId=invoice.data!.id as string;
   const line=await admin.from("invoice_items").insert({
     invoice_id:invoiceId,lesson_id:null,kind:"lesson",
     description:"Synthetic knight training session",quantity:1,
     unit_cents:4800,amount_cents:4800,sort_order:0,
   });
   expect(line.error).toBeNull();

   const invalidConsent=await call("ccp_v1_billing_invoice_checkout",{
     invoiceId,confirmed:true,
   });
   expect(invalidConsent.error?.code).toBe("VALIDATION_ERROR");
   expect(calls).toHaveLength(0);

   const website=await page.request.post("/api/billing/invoices/"+invoiceId+"/checkout");
   expect(website.status(),await website.text()).toBe(200);
   const browserCheckout=await website.json();
   expect(browserCheckout.url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_ccp/);
   expect(browserCheckout.sessionId).toMatch(/^cs_test_ccp[0-9]{8}$/);
   const viaMcp=await call("ccp_v1_billing_invoice_checkout",{
     invoiceId,confirmed:true,confirmedExternal:true,
   });
   expect(viaMcp.error).toBeUndefined();
   expect(viaMcp.data).toEqual(browserCheckout);
   expect(calls).toHaveLength(1);
   expect(calls[0].amountCents).toBe(4800);
   expect(calls[0].idempotencyKey).toMatch(/^ccp-checkout-v1-/);
   expect(JSON.stringify(viaMcp.data)).not.toContain(secret);

   const pdf=await call("ccp_v1_billing_invoice_pdf",{invoiceId,confirmed:true});
   expect(pdf.error).toBeUndefined();
   expect(Buffer.from(pdf.data.base64,"base64").subarray(0,5).toString()).toBe("%PDF-");
   const browserPdf=await page.request.get("/api/billing/invoices/"+invoiceId+"/pdf");
   expect(browserPdf.status(),await browserPdf.text()).toBe(200);
   expect((await browserPdf.body()).subarray(0,5).toString()).toBe("%PDF-");

   // Recording a payment already received is not a card charge. It first
   // expires the provider session, then atomically settles and updates ledger.
   const paymentIdempotency=randomUUID();
   const payment=await call("ccp_v1_billing_manual_payment_record",{
     invoiceId,amountCents:4800,note:"Synthetic cash settlement",
     idempotencyKey:paymentIdempotency,confirmed:true,
   });
   expect(payment.error).toBeUndefined();
   expect(payment.data.ok).toBe(true);
   expect(expired.has(browserCheckout.sessionId)).toBe(true);
   const replayPayment=await call("ccp_v1_billing_manual_payment_record",{
     invoiceId,amountCents:4800,note:"Synthetic cash settlement",
     idempotencyKey:paymentIdempotency,confirmed:true,
   });
   expect(replayPayment.error).toBeUndefined();
   expect(replayPayment.data.replayed).toBe(true);
   const persisted=await admin.from("invoices").select("status,stripe_checkout_url")
     .eq("id",invoiceId).single();
   expect(persisted.error).toBeNull();
   expect(persisted.data!.status).toBe("paid");
   expect(persisted.data!.stripe_checkout_url).toBeNull();

   const browserLedger=await page.request.get("/api/billing/export");
   expect(browserLedger.status(),await browserLedger.text()).toBe(200);
   const modelLedger=await call("ccp_v1_billing_payments_export",{confirmed:true});
   expect(modelLedger.error).toBeUndefined();
   const lineForInvoice=(csv:string)=>csv.split("\n").find(row=>row.includes(invoiceId));
   expect(lineForInvoice(await browserLedger.text())).toBeTruthy();
   expect(lineForInvoice(modelLedger.data.csv)).toBe(lineForInvoice(await browserLedger.text()));
 }finally{
   if(configured){
     const restored=await page.request.put("/api/settings/policy",{data:{
       paymentProvider:"manual",clearStripeSecretKey:true,
       clearStripePublishableKey:true,clearStripeWebhookSecret:true,
     }});
     expect(restored.status(),await restored.text()).toBe(200);
   }
   await close(stripe);
 }
});
