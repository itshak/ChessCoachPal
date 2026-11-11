import {createHash,randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {createClient} from "@supabase/supabase-js";
import {delegatedTool} from "./helpers/delegated-mcp";

type Issued={scope:string;challenge:string};
async function startMockLichess(){
  const codes=new Map<string,Issued>();
  const tokens=new Map<string,string>();
  const revoked=new Set<string>();
  let failRevoke=false;
  const app=createServer(async(req,res)=>{
    const url=new URL(req.url??"/","http://127.0.0.1:3999");
    if(req.method==="GET"&&url.pathname==="/oauth"){
      const code="mock_"+randomUUID().replaceAll("-","");
      codes.set(code,{scope:url.searchParams.get("scope")??"",
        challenge:url.searchParams.get("code_challenge")??""});
      const callback=new URL(url.searchParams.get("redirect_uri")??"");
      callback.searchParams.set("state",url.searchParams.get("state")??"");
      callback.searchParams.set("code",code);
      res.writeHead(302,{Location:callback.toString()});res.end();return;
    }
    if(req.method==="POST"&&url.pathname==="/api/token"){
      let payload="";
      for await(const chunk of req)payload+=String(chunk);
      const form=new URLSearchParams(payload);
      const code=form.get("code")??"";
      const issued=codes.get(code);
      const challenge=createHash("sha256").update(form.get("code_verifier")??"").digest("base64url");
      if(!issued||issued.challenge!==challenge){
        res.writeHead(400);res.end();return;
      }
      codes.delete(code);
      const token="synthetic_"+randomUUID().replaceAll("-","");
      tokens.set(token,issued.scope);
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({access_token:token,token_type:"Bearer",scope:issued.scope}));return;
    }
    if(req.method==="GET"&&url.pathname==="/api/account"){
      const token=(req.headers.authorization??"").replace(/^Bearer /,"");
      if(!tokens.has(token)||revoked.has(token)){res.writeHead(401);res.end();return;}
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify({id:"mockchesscoach",username:"mockchesscoach"}));return;
    }
    if(req.method==="GET"&&(url.pathname==="/api/study/by/mockchesscoach"||
       url.pathname==="/api/study/StUd1234.pgn")){
      const token=(req.headers.authorization??"").replace(/^Bearer /,"");
      if(!tokens.get(token)?.includes("study:read")||revoked.has(token)){
        res.writeHead(401);res.end();return;
      }
      if(url.pathname==="/api/study/by/mockchesscoach"){
        res.writeHead(200,{"Content-Type":"application/x-ndjson"});
        res.end(JSON.stringify({id:"StUd1234",name:"Synthetic chess endgames",
          createdAt:1400000000000,updatedAt:1800000000000})+"\n");
        return;
      }
      const pgn=Array.from({length:40},(_,i)=>{
        const index=i+1;
        const chapterId="Ch"+String(index).padStart(6,"0");
        const name=index===32?"Rook endgame: Lucena position":"Opening chapter "+index;
        return [
          `[Event "Synthetic chess endgames: ${name}"]`,
          '[StudyName "Synthetic chess endgames"]',
          `[ChapterName "${name}"]`,
          `[ChapterURL "https://lichess.org/study/StUd1234/${chapterId}"]`,
          `[Opening "${index===32?"Lucena bridge":"Four Knights"}"]`,
          `[ECO "${index===32?"E00":"C47"}"]`,
          '[Result "*"]',"","*",
        ].join("\n");
      }).join("\n\n");
      res.writeHead(200,{"Content-Type":"application/x-chess-pgn"});
      res.end(pgn);return;
    }
    if(req.method==="DELETE"&&url.pathname==="/api/token"){
      if(failRevoke){res.writeHead(503);res.end();return;}
      const token=(req.headers.authorization??"").replace(/^Bearer /,"");
      revoked.add(token);res.writeHead(204);res.end();return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise<void>((resolve,reject)=>{
    app.once("error",reject);app.listen(3999,"127.0.0.1",resolve);
  });
  return {server:app,tokens,revoked,setFailRevoke:(v:boolean)=>{failRevoke=v;}};
}
async function close(server:Server){
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}

test("PARITY:PARITY-lichess-oauth-provider-consent authenticates browser PKCE and keeps MCP credentials redacted",async({page,request})=>{
  const provider=await startMockLichess();
  try {
    const call=await delegatedTool(page,request);
    const initial=await page.request.get("/api/lichess/connection");
    expect(initial.status()).toBe(200);
    const status=await call("ccp_v1_lichess_connection_status",{});
    expect(status.error).toBeUndefined();
    expect(status.data).toEqual(await initial.json());
    const handoff=await call("ccp_v1_lichess_connect_handoff",{mode:"read"});
    expect(handoff.error).toBeUndefined();
    expect(handoff.data.connectUrl).toBe("http://localhost:3000/api/lichess/connect?mode=read");

    await page.goto("/api/lichess/connect?mode=read");
    await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
    const connected=await call("ccp_v1_lichess_connection_status",{});
    expect(connected.error).toBeUndefined();
    expect(connected.data).toMatchObject({
      connected:true,username:"mockchesscoach",scopes:["study:read"],canPublish:false,
    });
    const browser=await page.request.get("/api/lichess/connection");
    expect(browser.status()).toBe(200);
    expect(await browser.json()).toEqual(connected.data);
    const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:secret,error:secretError}=await admin.from("teacher_lichess_connections")
      .select("token_ciphertext,token_sha256,teacher_id").single();
    expect(secretError).toBeNull();
    expect(secret!.token_ciphertext).toMatch(/^enc\.v1\./);
    expect(JSON.stringify(connected.data)).not.toContain(secret!.token_ciphertext);
    expect(JSON.stringify(connected.data)).not.toContain([...provider.tokens.keys()][0]);
    const denied=await page.request.delete("/api/lichess/connection",{data:{confirmed:false}});
    expect(denied.status()).toBe(400);
    expect((await call("ccp_v1_lichess_connection_status",{})).data.connected).toBe(true);

    await page.goto("/api/lichess/connect?mode=write");
    await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
    const elevated=await call("ccp_v1_lichess_connection_status",{});
    expect(elevated.data).toMatchObject({
      connected:true,scopes:["study:read","study:write"],canPublish:true,
    });
    expect(provider.revoked.size).toBe(1);
    expect(elevated.data.previousRevokeFailed).toBe(false);
    provider.setFailRevoke(true);
    const disconnected=await call("ccp_v1_lichess_connection_disconnect",{confirmed:true});
    expect(disconnected.error).toBeUndefined();
    expect(disconnected.data).toMatchObject({
      disconnected:true,providerRevoked:false,manualRevokeRequired:true,
    });
    expect(disconnected.data.manualRevokeUrl).toMatch(/^https:\/\/lichess\.org/);
    const after=await page.request.get("/api/lichess/connection");
    expect(await after.json()).toMatchObject({connected:false,canPublish:false});
    expect((await call("ccp_v1_lichess_connection_status",{})).data)
      .toEqual(await after.json());
    const repeated=await page.request.delete("/api/lichess/connection",{data:{confirmed:true}});
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toMatchObject({
      disconnected:true,providerRevoked:null,manualRevokeRequired:false,
    });
    const {data:events,error:eventsError}=await admin.from("teacher_lichess_connection_events")
      .select("action,provider_revoked").order("created_at");
    expect(eventsError).toBeNull();
    expect(events?.map(e=>e.action)).toEqual(["connected","reconnected","disconnected"]);
    expect(events?.[2]?.provider_revoked).toBe(false);
  }finally{await close(provider.server);}
});

test("PARITY:PARITY-lichess-tenant-security never returns another coach's provider connection",async({page,request})=>{
  const call=await delegatedTool(page,request);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const email="foreign-lichess-"+randomUUID()+"@example.com";
  const {data:foreign,error:userError}=await admin.auth.admin.createUser({
    email,password:"SyntheticForeignTenant-123!",email_confirm:true,
  });
  expect(userError).toBeNull();
  const id=foreign.user!.id;
  try{
    expect((await admin.from("teachers").insert({
      id,email,display_name:"Foreign Lichess teacher",
    })).error).toBeNull();
    expect((await admin.from("teacher_lichess_connections").insert({
      teacher_id:id,lichess_username:"private-foreign-coach",
      scopes:["study:read"],token_ciphertext:"enc.v1.synthetic-protected",
      token_sha256:"1".repeat(64),
    })).error).toBeNull();
    const website=await page.request.get("/api/lichess/connection");
    expect(website.status()).toBe(200);
    expect((await website.json()).connected).toBe(false);
    const mcp=await call("ccp_v1_lichess_connection_status",{});
    expect(mcp.error).toBeUndefined();
    expect(mcp.data).toEqual(await website.json());
    const {data:still}=await admin.from("teacher_lichess_connections")
      .select("lichess_username").eq("teacher_id",id).single();
    expect(still?.lichess_username).toBe("private-foreign-coach");
  }finally{
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});


test("PARITY:PARITY-lichess-study-chapter-32 searches actual OAuth-authorized PGN metadata in website and MCP",async({page,request})=>{
  const provider=await startMockLichess();
  try{
    const call=await delegatedTool(page,request);
    const disconnected=await page.request.get("/api/lichess/studies");
    expect(disconnected.status()).toBe(409);
    const modelDisconnected=await call("ccp_v1_lichess_studies_search",{});
    expect(modelDisconnected.error).toBeDefined();

    await page.goto("/api/lichess/connect?mode=read");
    await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
    const listing=await page.request.get("/api/lichess/studies?query=chess");
    expect(listing.status(),await listing.text()).toBe(200);
    const studies=await listing.json();
    expect(studies.studies).toMatchObject([
      {id:"StUd1234",name:"Synthetic chess endgames"},
    ]);
    const mcpList=await call("ccp_v1_lichess_studies_search",{query:"chess"});
    expect(mcpList.error).toBeUndefined();
    expect(mcpList.data).toEqual(studies);
    expect(JSON.stringify(mcpList.data)).not.toContain([...provider.tokens.keys()][0]);

    // PGN's ChapterName, StudyName, ECO, Opening and ChapterURL tags are
    // authoritative. The 32nd chapter is not confused with "Chapter 3".
    const url="/api/lichess/studies?studyId=StUd1234&chapterNumber=32&query=Lucena";
    const website=await page.request.get(url);
    expect(website.status(),await website.text()).toBe(200);
    const chapter=await website.json();
    expect(chapter.chapterCount).toBe(40);
    expect(chapter.matches).toHaveLength(1);
    expect(chapter.matches[0]).toMatchObject({
      studyId:"StUd1234",studyName:"Synthetic chess endgames",
      chapterNumber:32,chapterName:"Rook endgame: Lucena position",
      chapterUrl:"https://lichess.org/study/StUd1234/Ch000032",
      opening:"Lucena bridge",eco:"E00",
    });
    const model=await call("ccp_v1_lichess_studies_search",{
      studyId:"StUd1234",chapterNumber:32,query:"Lucena",limit:50,
    });
    expect(model.error).toBeUndefined();
    expect(model.data).toEqual(chapter);
    expect(JSON.stringify(model.data)).not.toContain([...provider.tokens.keys()][0]);

    const impossible=await page.request.get(
      "/api/lichess/studies?studyId=StUd1234&chapterNumber=64");
    expect(impossible.status()).toBe(200);
    expect((await impossible.json()).matches).toHaveLength(0);
    expect((await page.request.get("/api/lichess/studies?chapterNumber=32")).status()).toBe(400);
    expect((await call("ccp_v1_lichess_studies_search",{chapterNumber:32})).error?.code)
      .toBe("VALIDATION_ERROR");
    expect((await page.request.get("/api/lichess/studies?studyId=../secret")).status()).toBe(400);

    const disconnect=await page.request.delete("/api/lichess/connection",{
      data:{confirmed:true},
    });
    expect(disconnect.status()).toBe(200);
    expect((await page.request.get(url)).status()).toBe(409);
    expect((await call("ccp_v1_lichess_studies_search",{
      studyId:"StUd1234",chapterNumber:32,
    })).error).toBeDefined();
  }finally{await close(provider.server);}
});
