import {randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:PARITY-configured-checkout-independent-two-claim-race keeps only one payable provider session",async({page,request})=>{
 test.skip(process.env.CI!=="true"||
  process.env.CCP_SYNTHETIC_STRIPE_ORIGIN!=="http://127.0.0.1:3997",
  "Fixed CI-only loopback provider required; no real payments");
 const minted:string[]=[];
 const expired=new Set<string>();
 const stripe=createServer(async(req,res)=>{
  const path=(req.url??"").split("?")[0];
  if(!String(req.headers.authorization??"").startsWith("Bearer sk_live_chesscoachpal_ci_")){
   res.writeHead(401);res.end();return;
  }
  if(req.method==="POST"&&path==="/v1/checkout/sessions"){
   for await(const _ of req){/* consume synthetic form request */}
   const id="cs_test_ccp"+String(minted.length+1).padStart(8,"0");
   minted.push(id);
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({id,object:"checkout.session",status:"open",
    url:"https://checkout.stripe.com/c/pay/"+id}));
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
   res.end(JSON.stringify({id:match[1],object:"checkout.session",status:"expired"}));
   return;
  }
  res.writeHead(404,{"Content-Type":"application/json"});res.end("{}");
 });
 await new Promise<void>((resolve,reject)=>{
  stripe.once("error",reject);stripe.listen(3997,"127.0.0.1",resolve);
 });
 let configured=false;
 try{
  const call=await delegatedTool(page,request);
  const before=await page.request.get("/api/settings/policy");
  expect(before.status(),await before.text()).toBe(200);
  expect((await before.json()).payment_provider).toBe("manual");
  const secret="sk_live_chesscoachpal_ci_"+randomUUID().replaceAll("-","");
  const publishable="pk_live_chesscoachpal_ci_"+randomUUID().replaceAll("-","");
  const settings=await page.request.put("/api/settings/policy",{data:{
   paymentProvider:"stripe",stripeSecretKey:secret,stripePublishableKey:publishable,
  }});
  expect(settings.status(),await settings.text()).toBe(200);
  configured=true;
  expect(JSON.stringify(await settings.json())).not.toContain(secret);
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
  const guardian=await admin.from("guardians").insert({
   teacher_id:teacherId,name:"Racing provider family "+randomUUID(),
   portal_token:randomUUID(),email:"race-"+randomUUID()+"@example.com",
  }).select("id").single();
  expect(guardian.error).toBeNull();
  const invoice=await admin.from("invoices").insert({
   teacher_id:teacherId,guardian_id:guardian.data!.id,status:"sent",
   currency:"USD",period_start:"2058-11-01",period_end:"2058-11-30",
   subtotal_cents:6100,
  }).select("id").single();
  expect(invoice.error).toBeNull();
  const invoiceId=invoice.data!.id as string;
  expect((await admin.from("invoice_items").insert({
   invoice_id:invoiceId,lesson_id:null,kind:"lesson",
   description:"Synthetic independent knight endgame",quantity:1,
   unit_cents:6100,amount_cents:6100,sort_order:0,
  })).error).toBeNull();
  const [site,agent]=await Promise.all([
   page.request.post("/api/billing/invoices/"+invoiceId+"/checkout"),
   call("ccp_v1_billing_invoice_checkout",{
    invoiceId,confirmed:true,confirmedExternal:true,
   }),
  ]);
  const webOk=site.status()===200,agentOk=agent.error===undefined;
  expect(Number(webOk)+Number(agentOk)).toBe(1);
  if(!webOk)expect(site.status()).toBe(409);
  if(!agentOk)expect(agent.error?.code).toBe("CONFLICT");
  expect(minted).toHaveLength(2);
  const stored=await admin.from("invoices")
   .select("stripe_checkout_session_id,stripe_checkout_url")
   .eq("id",invoiceId).single();
  expect(stored.error).toBeNull();
  const winner=stored.data!.stripe_checkout_session_id as string;
  expect(minted).toContain(winner);
  expect(stored.data!.stripe_checkout_url).toBe(
   "https://checkout.stripe.com/c/pay/"+winner);
  const loser=minted.find(id=>id!==winner);
  expect(loser).toBeDefined();
  expect(expired.has(loser!)).toBe(true);
  expect(expired.has(winner)).toBe(false);
  const replay=await call("ccp_v1_billing_invoice_checkout",{
   invoiceId,confirmed:true,confirmedExternal:true,
  });
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual({
   url:stored.data!.stripe_checkout_url,sessionId:winner,
  });
  expect(minted).toHaveLength(2);
  expect(JSON.stringify({stored:stored.data,replay})).not.toContain(secret);
 }finally{
  if(configured){
   const restore=await page.request.put("/api/settings/policy",{data:{
    paymentProvider:"manual",clearStripeSecretKey:true,
    clearStripePublishableKey:true,clearStripeWebhookSecret:true,
   }});
   expect(restore.status(),await restore.text()).toBe(200);
  }
  await new Promise<void>((resolve,reject)=>stripe.close(e=>e?reject(e):resolve()));
 }
});
