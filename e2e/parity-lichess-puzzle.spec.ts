import {createHash,randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

const sampleFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const draft={studyId:"StUd1234",chapterName:"Reviewed chess photo",
  fen:sampleFen,moves:"1. e4 e5 2. Nf3 Nc6",orientation:"white" as const};
async function startProvider(){
 const codes=new Map<string,{scope:string;challenge:string}>();
 const tokens=new Map<string,string>();
 const imports:Array<{chapterId:string;pgn:string;name:string}>=[];
 let failImport=false;
 const app=createServer(async(req,res)=>{
  const url=new URL(req.url??"/","http://127.0.0.1:3999");
  if(req.method==="GET"&&url.pathname==="/oauth"){
   const code="puzzle_"+randomUUID().replaceAll("-","");
   codes.set(code,{scope:url.searchParams.get("scope")??"",
     challenge:url.searchParams.get("code_challenge")??""});
   const next=new URL(url.searchParams.get("redirect_uri")??"");
   next.searchParams.set("code",code);
   next.searchParams.set("state",url.searchParams.get("state")??"");
   res.writeHead(302,{Location:next.toString()});res.end();return;
  }
  if(req.method==="POST"&&url.pathname==="/api/token"){
   let text="";
   for await(const chunk of req)text+=String(chunk);
   const form=new URLSearchParams(text);
   const issued=codes.get(form.get("code")??"");
   const challenge=createHash("sha256")
    .update(form.get("code_verifier")??"").digest("base64url");
   if(!issued||issued.challenge!==challenge){res.writeHead(400);res.end();return;}
   codes.delete(form.get("code")??"");
   const token="puzzle_synthetic_"+randomUUID().replaceAll("-","");
   tokens.set(token,issued.scope);
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({access_token:token,token_type:"Bearer",
     scope:issued.scope}));return;
  }
  if(req.method==="GET"&&url.pathname==="/api/account"){
   const token=(req.headers.authorization??"").replace(/^Bearer /,"");
   if(!tokens.has(token)){res.writeHead(401);res.end();return;}
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({id:"mockchesscoach",username:"mockchesscoach"}));return;
  }
  if(req.method==="DELETE"&&url.pathname==="/api/token"){
   res.writeHead(204);res.end();return;
  }
  if(req.method==="POST"&&url.pathname==="/api/study/StUd1234/import-pgn"){
   const token=(req.headers.authorization??"").replace(/^Bearer /,"");
   if(!tokens.get(token)?.includes("study:write")){
    res.writeHead(403);res.end();return;
   }
   let body="";
   for await(const chunk of req)body+=String(chunk);
   const form=new URLSearchParams(body);
   const pgn=form.get("pgn")??"";
   const name=form.get("name")??"";
   if(!pgn.includes('[SetUp "1"]')||!pgn.includes('[FEN "'+sampleFen+'"]')||
      !name||form.get("mode")!=="practice"){
    res.writeHead(400);res.end();return;
   }
   const chapterId="PuZz"+String(imports.length+1).padStart(4,"0");
   imports.push({chapterId,pgn,name});
   if(failImport){res.writeHead(503);res.end();return;}
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({chapters:[{id:chapterId,name,
    players:[{name:"Puzzle",rating:0},{name:"Puzzle",rating:0}],status:"*"}]}));
   return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise<void>((resolve,reject)=>{
  app.once("error",reject);app.listen(3999,"127.0.0.1",resolve);
 });
 return {server:app,imports,setFailImport:(v:boolean)=>{failImport=v;},tokens};
}
async function close(server:Server){
 await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}

test("PARITY:PARITY-lichess-image-fen-human-review makes identical website and MCP board proposals without publishing",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const website=await page.request.post("/api/lichess/puzzles/preview",{data:draft});
 expect(website.status(),await website.text()).toBe(200);
 const reviewed=await website.json();
 expect(reviewed.board).toHaveLength(8);
 expect(reviewed.board[0][4]).toBe("k");
 expect(reviewed.board[7][4]).toBe("K");
 expect(reviewed.sideToMove).toBe("white");
 expect(reviewed.sha256).toMatch(/^[a-f0-9]{64}$/);
 const model=await call("ccp_v1_lichess_puzzle_preview",draft);
 expect(model.error).toBeUndefined();
 expect(model.data).toEqual(reviewed);
 expect(JSON.stringify(model.data)).not.toContain("Bearer");
 const malformed={...draft,fen:"8/8/8/8/8/8/8/8 w - - 0 1"};
 expect((await page.request.post("/api/lichess/puzzles/preview",{
  data:malformed,
 })).status()).toBe(400);
 expect((await call("ccp_v1_lichess_puzzle_preview",malformed)).error?.code)
  .toBe("VALIDATION_ERROR");
 const unsafe={...draft,moves:'1. e4\\n[FEN "unreviewed"]'};
 expect((await page.request.post("/api/lichess/puzzles/preview",{
  data:unsafe,
 })).status()).toBe(400);
 expect((await call("ccp_v1_lichess_puzzle_preview",unsafe)).error?.code)
  .toBe("VALIDATION_ERROR");
});

test("PARITY:PARITY-lichess-approved-puzzle-provider-import requires write scope and publishes one chapter despite cross-client retries",async({page,request})=>{
 const provider=await startProvider();
 try{
  const call=await delegatedTool(page,request);
  const webPreview=await page.request.post("/api/lichess/puzzles/preview",{
   data:draft,
  });
  expect(webPreview.status()).toBe(200);
  const preview=await webPreview.json();
  const firstKey=randomUUID();
  const approved={...draft,expectedSha256:preview.sha256,
    idempotencyKey:firstKey,confirmed:true,confirmedExternal:true};

  await page.goto("/api/lichess/connect?mode=read");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  expect((await page.request.post("/api/lichess/puzzles",{
    data:approved,
  })).status()).toBe(403);
  expect((await call("ccp_v1_lichess_puzzle_publish",approved)).error?.code)
    .toBe("SCOPE_DENIED");
  expect(provider.imports).toHaveLength(0);

  await page.goto("/api/lichess/connect?mode=write");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  expect((await page.request.post("/api/lichess/puzzles",{
   data:{...approved,confirmedExternal:false},
  })).status()).toBe(400);
  expect((await call("ccp_v1_lichess_puzzle_publish",{
   ...approved,confirmedExternal:false,
  })).error?.code).toBe("VALIDATION_ERROR");
  expect(provider.imports).toHaveLength(0);

  const first=await call("ccp_v1_lichess_puzzle_publish",approved);
  expect(first.error).toBeUndefined();
  expect(first.data).toMatchObject({
   ok:true,replayed:false,studyId:"StUd1234",
   chapterId:"PuZz0001",chapterName:draft.chapterName,
   chapterUrl:"https://lichess.org/study/StUd1234/PuZz0001",
  });
  expect(provider.imports).toHaveLength(1);
  expect(provider.imports[0].pgn).toContain('[FEN "'+sampleFen+'"]');
  const replayWebsite=await page.request.post("/api/lichess/puzzles",{
   data:approved,
  });
  expect(replayWebsite.status(),await replayWebsite.text()).toBe(200);
  expect(await replayWebsite.json()).toMatchObject({
   ok:true,replayed:true,chapterId:"PuZz0001",
  });
  expect(provider.imports).toHaveLength(1);

  const changedDraft={...draft,chapterName:"A second reviewed puzzle"};
  const secondPreview=await call("ccp_v1_lichess_puzzle_preview",changedDraft);
  expect(secondPreview.error).toBeUndefined();
  const secondApproved={...changedDraft,expectedSha256:secondPreview.data.sha256,
   idempotencyKey:randomUUID(),confirmed:true,confirmedExternal:true};
  const second=await page.request.post("/api/lichess/puzzles",{
   data:secondApproved,
  });
  expect(second.status(),await second.text()).toBe(200);
  expect(await second.json()).toMatchObject({
   ok:true,replayed:false,chapterId:"PuZz0002",
  });
  const replayMcp=await call("ccp_v1_lichess_puzzle_publish",secondApproved);
  expect(replayMcp.error).toBeUndefined();
  expect(replayMcp.data).toMatchObject({ok:true,replayed:true,chapterId:"PuZz0002"});
  expect(provider.imports).toHaveLength(2);
  const misuse=await call("ccp_v1_lichess_puzzle_publish",{
   ...secondApproved,idempotencyKey:firstKey,
  });
  expect(misuse.error?.code).toBe("IDEMPOTENCY_CONFLICT");
  expect(provider.imports).toHaveLength(2);

  // A provider 503 is ambiguous: it may have created the chapter.
  // Neither interface automatically retries the same content after it.
  provider.setFailImport(true);
  const third={...draft,chapterName:"Ambiguous provider receipt"};
  const thirdPreview=await call("ccp_v1_lichess_puzzle_preview",third);
  expect(thirdPreview.error).toBeUndefined();
  const attempt={...third,expectedSha256:thirdPreview.data.sha256,
   idempotencyKey:randomUUID(),confirmed:true,confirmedExternal:true};
  const ambiguous=await page.request.post("/api/lichess/puzzles",{data:attempt});
  expect(ambiguous.status()).toBe(503);
  expect((await ambiguous.json()).code).toBe("PROVIDER_RECONCILIATION_REQUIRED");
  expect(provider.imports).toHaveLength(3);
  const noDuplicate=await call("ccp_v1_lichess_puzzle_publish",attempt);
  expect(noDuplicate.error?.code).toBe("PROVIDER_RECONCILIATION_REQUIRED");
  expect(provider.imports).toHaveLength(3);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
   process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false},
   });
  const {data:receipts,error}=await admin.from("lichess_puzzle_publications")
   .select("status,provider_chapter_id,content_hash,teacher_id");
  expect(error).toBeNull();
  expect(receipts?.filter(r=>r.status==="published")).toHaveLength(2);
  expect(receipts?.filter(r=>r.status==="attempted")).toHaveLength(1);
  expect(JSON.stringify(receipts)).not.toContain([...provider.tokens.keys()][0]);
 }finally{await close(provider.server);}
});


test("PARITY:PARITY-lichess-image-extraction-consent rejects unsafe uploads equally via website and MCP",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
   Buffer.alloc(64)]).toString("base64");
 const missingConsent=await page.request.post("/api/lichess/puzzles/preview",{
  data:{kind:"image",imageBase64:png,mediaType:"image/png"},
 });
 expect(missingConsent.status(),await missingConsent.text()).toBe(400);
 const mcpNoApproval=await call("ccp_v1_lichess_image_fen_propose",{
  imageBase64:png,mediaType:"image/png",confirmed:true,
 });
 expect(mcpNoApproval.error?.code).toBe("VALIDATION_ERROR");
 // A mismatched MIME/magic header must fail before provider settings and
 // external network access on both pathways, even after explicit consent.
 const website=await page.request.post("/api/lichess/puzzles/preview",{
  data:{kind:"image",imageBase64:png,mediaType:"image/jpeg",confirmedExternal:true},
 });
 expect(website.status(),await website.text()).toBe(400);
 expect((await website.json()).code).toBe("VALIDATION_ERROR");
 const mcp=await call("ccp_v1_lichess_image_fen_propose",{
  imageBase64:png,mediaType:"image/jpeg",confirmedExternal:true,confirmed:true,
 });
 expect(mcp.error?.code).toBe("VALIDATION_ERROR");
});
