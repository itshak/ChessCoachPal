import {randomUUID} from "node:crypto";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {createClient} from "@supabase/supabase-js";
import {SEED_TEACHER} from "./helpers/auth";

async function firstStudent(page:import("@playwright/test").Page){
 const r=await page.request.get("/api/students?limit=1");
 expect(r.status()).toBe(200);
 const id=(await r.json()).students[0]?.id as string;
 expect(id).toMatch(/^[0-9a-f-]{36}$/);
 return id;
}

test("PARITY:PARITY-chess-categories compares configuration create rename and reorder",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const label="MCP skill "+randomUUID().slice(0,8);
 const created=await callTool("ccp_v1_chess_categories_create",{
   name:label,description:"Synthetic skill",sortOrder:91,confirmed:true,
 });
 expect(created.error).toBeUndefined();
 const id=(created.data as {id:string}).id;
 const website=await page.request.post("/api/agent/v1",{data:{action:"chess.categories.list"}});
 expect(website.status()).toBe(200);
 const rows=(await website.json()).data as Array<{id:string;name:string;sort_order:number}>;
 expect(rows.some(row=>row.id===id&&row.name===label)).toBe(true);
 expect((await callTool("ccp_v1_chess_categories_list",{})).data).toEqual(rows);
 const corrected=await page.request.post("/api/agent/v1",{data:{
   action:"chess.categories.update",categoryId:id,name:label+" revised",sortOrder:92,
 }});
 expect(corrected.status()).toBe(200);
 const mcpNow=(await callTool("ccp_v1_chess_categories_list",{})).data as
  Array<{id:string;name:string;sort_order:number}>;
 expect(mcpNow.find(x=>x.id===id)).toMatchObject({name:label+" revised",sort_order:92});
 const mcpcorrected=await callTool("ccp_v1_chess_categories_update",{
   categoryId:id,description:"MCP corrected",confirmed:true,
 });
 expect(mcpcorrected.error).toBeUndefined();
 const siteNow=await page.request.post("/api/agent/v1",{data:{action:"chess.categories.list"}});
 expect((await siteNow.json()).data).toEqual((await callTool("ccp_v1_chess_categories_list",{})).data);
});

test("PARITY:PARITY-chess-observations requires actual browser-only teacher approval",async({page,request})=>{
 const callTool=await delegatedTool(page,request);
 const studentId=await firstStudent(page);
 const categories=(await callTool("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>;
 expect(categories.length).toBeGreaterThan(0);
 const proposed=await callTool("ccp_v1_chess_observations_propose",{
   studentId,categoryId:categories[0].id,
   observation:"Synthetic unverified endgame insight "+randomUUID(),
   requestId:randomUUID(),
 });
 expect(proposed.error).toBeUndefined();
 const value=proposed.data as {id:string;verified_at:string|null;source:string};
 expect(value.source).toBe("agent");
 expect(value.verified_at).toBeNull();
 const websiteBefore=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId,
 }});
 expect(websiteBefore.status()).toBe(200);
 expect(((await websiteBefore.json()).data as Array<{id:string;verified_at:string|null}>)
   .find(x=>x.id===value.id)?.verified_at).toBeNull();
 const corrected=await callTool("ccp_v1_chess_observations_update",{
   observationId:value.id,observation:"Teacher-reviewed candidate "+randomUUID(),confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const approved=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.approve",observationId:value.id,
 }});
 expect(approved.status(),await approved.text()).toBe(200);
 const webApproved=(await approved.json()).data as {verified_at:string};
 expect(webApproved.verified_at).toBeTruthy();
 const readMcp=(await callTool("ccp_v1_chess_observations_list",{
   studentId,
 })).data as Array<{id:string;verified_at:string;verified_by:string}>;
 expect(readMcp.find(x=>x.id===value.id)?.verified_at).toBeTruthy();
 const siteList=await page.request.post("/api/agent/v1",{data:{
   action:"chess.observations.list",studentId,
 }});
 expect((await siteList.json()).data).toEqual(readMcp);
});

test("PARITY:PARITY-material-links shares the typed catalog and revision guarded associations",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const studentId=await firstStudent(page);
 const material=await call("ccp_v1_learning_materials_create",{
 kind:"study_chapter",title:"Test study "+randomUUID().slice(0,8),
 description:"",sourceUrl:"https://lichess.org/study/AbCd1234",
 details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},
 requestId:randomUUID(),
});
 expect(material.error).toBeUndefined();
 const materialId=material.data.material.id as string;
 const requestId=randomUUID();
 const linked=await call("ccp_v1_material_links_create",{
   studentId,materialId,requestId,confirmed:true,
 });
 expect(linked.error).toBeUndefined();
 expect(linked.data.link.material_id).toBe(materialId);
 const id=linked.data.link.id as string;
 const browser=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.list",studentId,
 }});
 expect(browser.status(),await browser.text()).toBe(200);
 const current=(await browser.json()).data;
 const mcp=await call("ccp_v1_material_links_list",{studentId});
 expect(mcp.error).toBeUndefined();
 expect(mcp.data).toEqual(current);
 expect(current.links.some((l:{id:string;material_id:string})=>l.id===id&&l.material_id===materialId)).toBe(true);
 const replay=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.create",studentId,materialId,requestId,confirmed:true,
 }});
 expect(replay.status(),await replay.text()).toBe(201);
 expect((await replay.json()).data.replayed).toBe(true);
 const alternate=await call("ccp_v1_learning_materials_create",{
 kind:"study_chapter",title:"Test study "+randomUUID().slice(0,8),
 description:"",sourceUrl:"https://lichess.org/study/AbCd1234",
 details:{provider:"lichess",studyId:"AbCd1234",chapterId:null},
 requestId:randomUUID(),
,requestId:randomUUID()});
 expect(alternate.error).toBeUndefined();
 const corrected=await call("ccp_v1_material_links_update",{
   linkId:id,materialId:alternate.data.material.id,
   expectedRevision:linked.data.link.revision,confirmed:true,
 });
 expect(corrected.error).toBeUndefined();
 const stale=await page.request.post("/api/agent/v1",{data:{
   action:"materials.links.update",linkId:id,materialId,
   expectedRevision:linked.data.link.revision,confirmed:true,
 }});
 expect(stale.status()).toBe(409);
 const foreign=await call("ccp_v1_material_links_create",{
   studentId,materialId:randomUUID(),requestId:randomUUID(),confirmed:true,
 });
 expect(foreign.error?.code).toBe("NOT_FOUND");
});

test("PARITY:PARITY-chess-observation-attestation blocks bearer self-verification",async({page,request})=>{
  const callTool=await delegatedTool(page,request);
  const studentId=await firstStudent(page);
  const categories=(await callTool("ccp_v1_chess_categories_list",{})).data as Array<{id:string}>;
  expect(categories.length).toBeGreaterThan(0);
  const categoryId=categories[0].id;
  const proposed=await callTool("ccp_v1_chess_observations_propose",{
    studentId,categoryId,observation:"Not yet verified "+randomUUID(),
    requestId:randomUUID(),
  });
  expect(proposed.error).toBeUndefined();
  expect(proposed.data.verified_at).toBeNull();
  const website=await page.request.post("/api/agent/v1",{data:{
    action:"chess.observations.create",studentId,categoryId,
    observation:"Directly teacher-attested observation "+randomUUID(),
    requestId:randomUUID(),
  }});
  expect(website.status(),await website.text()).toBe(201);
  const verified=(await website.json()).data as {
    id:string;source:string;verified_at:string|null;verified_by:string|null;
  };
  expect(verified.source).toBe("teacher");
  expect(verified.verified_at).toBeTruthy();
  expect(verified.verified_by).toBeTruthy();
  const mcpList=(await callTool("ccp_v1_chess_observations_list",{studentId}))
    .data as Array<{id:string;verified_at:string|null}>;
  expect(mcpList.find(x=>x.id===verified.id)?.verified_at).toBeTruthy();
  expect(mcpList.find(x=>x.id===proposed.data.id)?.verified_at).toBeNull();

  const bearer=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{session},error}=await bearer.auth.signInWithPassword(SEED_TEACHER);
  expect(error).toBeNull();
  expect(session).toBeTruthy();
  const rejected=await request.post("/api/agent/v1",{
    headers:{Authorization:"Bearer "+session!.access_token},
    data:{action:"chess.observations.create",studentId,categoryId,
      observation:"Forged model attestation",requestId:randomUUID()},
  });
  expect(rejected.status(),await rejected.text()).toBe(403);
  expect((await rejected.json()).error.code).toBe("BROWSER_APPROVAL_REQUIRED");
});
