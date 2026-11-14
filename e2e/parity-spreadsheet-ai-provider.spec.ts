import {randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

type Attempt={authorization:string;body:string};
async function close(server:Server){
 await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}
test("PARITY:PARITY-spreadsheet-ai-provider-consent-response-and-failure is identical in browser and MCP",async({page,request})=>{
 test.skip(process.env.CI!=="true"||
  process.env.CCP_SYNTHETIC_AI_ORIGIN!=="http://127.0.0.1:3996",
  "Requires the fixed, CI-only synthetic AI loopback provider");
 const attempts:Attempt[]=[];
 let mode:"success"|"failure"|"invalid"="success";
 const synthetic=createServer(async(req,res)=>{
  if(req.method!=="POST"||req.url!=="/v1/chat/completions"){
   res.writeHead(404);res.end();return;
  }
  let body="";
  for await(const fragment of req)body+=String(fragment);
  attempts.push({authorization:String(req.headers.authorization??""),body});
  if(mode==="failure"){
   res.writeHead(503,{"Content-Type":"application/json"});
   res.end(JSON.stringify({error:"Provider echoed private sample PII-DO-NOT-LEAK"}));
   return;
  }
  const mapping=mode==="invalid"?
   {student_name:"Provider invented nonexistent column"}:
   {student_name:"Learner full name",guardian_name:"Parent contact",email:"Parent e-mail"};
  res.writeHead(200,{"Content-Type":"application/json"});
  res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(mapping)}}]}));
 });
 await new Promise<void>((resolve,reject)=>{
  synthetic.once("error",reject);
  synthetic.listen(3996,"127.0.0.1",resolve);
 });
 let configured=false;
 try{
  const call=await delegatedTool(page,request);
  const before=await page.request.get("/api/settings/policy");
  expect(before.status(),await before.text()).toBe(200);
  const beforeValue=await before.json();
  expect(beforeValue.ai_provider).toBe("none");
  const fakeKey="sk_test_chesscoachpal_ci_"+randomUUID().replaceAll("-","");
  const config=await page.request.put("/api/settings/policy",{
   data:{aiProvider:"openai",aiApiKey:fakeKey},
  });
  expect(config.status(),await config.text()).toBe(200);
  configured=true;
  expect(JSON.stringify(await config.json())).not.toContain(fakeKey);
  const headers=["Learner full name","Parent contact","Parent e-mail"];
  const marker="SYNTHETIC_PRIVATE_"+randomUUID();
  const sampleRows=[{"Learner full name":marker,
   "Parent contact":"Made-up guardian", "Parent e-mail":"fake-parent@example.com"}];
  const safe=await page.request.post("/api/import/spreadsheet/suggest",{
   data:{headers,sampleRows,useAi:false},
  });
  expect(safe.status(),await safe.text()).toBe(200);
  const safeMcp=await call("ccp_v1_import_spreadsheet_suggest",{
   headers,sampleRows,useAi:false,
  });
  expect(safeMcp.error).toBeUndefined();
  expect(safeMcp.data).toEqual(await safe.json());
  const notApproved=await call("ccp_v1_import_spreadsheet_suggest",{
   headers,sampleRows,useAi:true,
  });
  expect(notApproved.error?.code).toBe("VALIDATION_ERROR");
  expect(attempts).toHaveLength(0);
  const approved={headers,sampleRows,useAi:true,confirmedExternal:true};
  const website=await page.request.post("/api/import/spreadsheet/suggest",{data:approved});
  expect(website.status(),await website.text()).toBe(200);
  const aiSite=await website.json();
  expect(aiSite.mapping.student_name).toBe("Learner full name");
  expect(aiSite.mapping.guardian_name).toBe("Parent contact");
  expect(aiSite.warning).toBeNull();
  const aiMcp=await call("ccp_v1_import_spreadsheet_suggest",approved);
  expect(aiMcp.error).toBeUndefined();
  expect(aiMcp.data).toEqual(aiSite);
  expect(attempts).toHaveLength(2);
  for(const attempt of attempts){
   expect(attempt.authorization).toBe("Bearer "+fakeKey);
   expect(attempt.body).toContain(marker);
   const body=JSON.parse(attempt.body);
   expect(body.model).toBe("gpt-4o-mini");
  }
  expect(JSON.stringify(aiSite)).not.toContain(marker);
  expect(JSON.stringify(aiMcp)).not.toContain(fakeKey);
  mode="invalid";
  const invalid=await page.request.post("/api/import/spreadsheet/suggest",{data:approved});
  expect(invalid.status()).toBe(502);
  expect((await invalid.json()).code).toBe("AI_UNAVAILABLE");
  mode="failure";
  const failedSite=await page.request.post("/api/import/spreadsheet/suggest",{data:approved});
  expect(failedSite.status()).toBe(502);
  const body=await failedSite.json();
  expect(body.code).toBe("AI_UNAVAILABLE");
  const failedTool=await call("ccp_v1_import_spreadsheet_suggest",approved);
  expect(failedTool.error?.code).toBe("AI_UNAVAILABLE");
  expect(JSON.stringify({body,model:failedTool})).not.toContain("PII-DO-NOT-LEAK");
  expect(JSON.stringify({body,model:failedTool})).not.toContain(marker);
  expect(JSON.stringify({body,model:failedTool})).not.toContain(fakeKey);
 }finally{
  if(configured){
   const restore=await page.request.put("/api/settings/policy",{
    data:{aiProvider:"none",clearAiApiKey:true},
   });
   expect(restore.status(),await restore.text()).toBe(200);
  }
  await close(synthetic);
 }
});
