import {createHash,randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

const uuid=()=>randomUUID();
const randomName=(x:string)=>x+" "+uuid().slice(0,10);
const startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
async function close(server:Server){
 await new Promise<void>((ok,bad)=>server.close(e=>e?bad(e):ok()));
}
async function newTeacherStudents(call:Awaited<ReturnType<typeof delegatedTool>>){
 const workplace=await call("ccp_v1_workplaces_create",{
  name:randomName("Integrated chess club"),timezone:"UTC",currency:"USD",
  locale:"en",policy:{},idempotencyKey:uuid(),
 });
 expect(workplace.error).toBeUndefined();
 const workplaceId=workplace.data.entityId as string;
 const ids:string[]=[],names:string[]=[];
 for(let i=0;i<3;i++){
  const name=randomName("Integrated learner "+i);
  names.push(name);
  const created=await call("ccp_v1_students_create",{name,idempotencyKey:uuid()});
  expect(created.error).toBeUndefined();
  const studentId=created.data.entityId as string;
  expect((await call("ccp_v1_workplaces_enroll",{
   workplaceId,studentId,idempotencyKey:uuid(),
  })).error).toBeUndefined();
  ids.push(studentId);
 }
 return {workplaceId,ids,names};
}
async function ratingProvider(){
 const app=createServer(async(req,res)=>{
  const url=new URL(req.url??"/","http://127.0.0.1:3995");
  if(req.method!=="GET"){res.writeHead(405);res.end();return;}
  const now=Math.floor(Date.now()/1000);
  if(url.pathname.startsWith("/api/user/")){
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({perfs:{
    rapid:{rating:2014,rd:63,prov:false,games:100},
    blitz:{rating:1930,rd:81,prov:true,games:8},
   }}));return;
  }
  if(url.pathname.startsWith("/pub/player/")&&url.pathname.endsWith("/stats")){
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({chess_rapid:{
    last:{rating:1878,date:now},record:{win:20,loss:11,draw:7},
   },chess_blitz:{last:{rating:1763,date:now},record:{win:5,loss:2,draw:2}}}));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise<void>((yes,no)=>{app.once("error",no);app.listen(3995,"127.0.0.1",yes);});
 return app;
}
async function lichessStudyProvider(){
 const codes=new Map<string,{scope:string;challenge:string}>();
 const tokens=new Map<string,string>();
 const names=["Puzzles","Puzzles 2"];
 const studies=[{id:"PuzZ0001",name:names[0]},{id:"PuzZ0002",name:names[1]}];
 let createCount=0;
 const app=createServer(async(req,res)=>{
  const url=new URL(req.url??"/","http://127.0.0.1:3999");
  if(req.method==="GET"&&url.pathname==="/oauth"){
   const code="study_"+uuid().replaceAll("-","");
   codes.set(code,{scope:url.searchParams.get("scope")??"",
    challenge:url.searchParams.get("code_challenge")??""});
   const redirect=new URL(url.searchParams.get("redirect_uri")??"");
   redirect.searchParams.set("state",url.searchParams.get("state")??"");
   redirect.searchParams.set("code",code);
   res.writeHead(302,{Location:redirect.toString()});res.end();return;
  }
  if(req.method==="POST"&&url.pathname==="/api/token"){
   let raw="";for await(const c of req)raw+=String(c);
   const form=new URLSearchParams(raw),c=form.get("code")??"";
   const issued=codes.get(c);
   const challenge=createHash("sha256").update(form.get("code_verifier")??"").digest("base64url");
   if(!issued||issued.challenge!==challenge){res.writeHead(400);res.end();return;}
   codes.delete(c);
   const token="chapter_synthetic_"+uuid().replaceAll("-","");
   tokens.set(token,issued.scope);
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({access_token:token,scope:issued.scope,token_type:"Bearer"}));return;
  }
  const token=(req.headers.authorization??"").replace(/^Bearer /,"");
  if(req.method==="DELETE"&&url.pathname==="/api/token"){
   tokens.delete(token);res.writeHead(204);res.end();return;
  }
  if(!tokens.has(token)){res.writeHead(401);res.end();return;}
  if(req.method==="GET"&&url.pathname==="/api/account"){
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({id:"mockchesscoach",username:"mockchesscoach"}));return;
  }
  if(req.method==="GET"&&url.pathname==="/api/study/by/mockchesscoach"){
   res.writeHead(200,{"Content-Type":"application/x-ndjson"});
   res.end([...studies,{id:"StUd1234",name:"Classic Games 2"}].map(x=>
    JSON.stringify({id:x.id,name:x.name,createdAt:1400000000000,updatedAt:1800000000000})).join("\n")+"\n");return;
  }
  if(req.method==="GET"&&url.pathname==="/api/study/StUd1234.pgn"){
   const pg=Array.from({length:64},(_,i)=>{
    const index=i+1,id="Ch"+String(index).padStart(6,"0");
    const special=index===32;
    return [
     '[Event "'+(special?"Steinitz–Chigorin":"Classical game "+index)+'"]',
     '[StudyName "Classic Games 2"]',
     '[ChapterName "'+(special?"Steinitz vs Chigorin":"Game "+index)+'"]',
     '[ChapterURL "https://lichess.org/study/StUd1234/'+id+'"]',
     '[White "'+(special?"Steinitz":"White "+index)+'"]',
     '[Black "'+(special?"Chigorin":"Black "+index)+'"]',
     '[Date "1892.01.01"]','[Result "*"]',"","*",
    ].join("\n");
   }).join("\n\n");
   res.writeHead(200,{"Content-Type":"application/x-chess-pgn"});res.end(pg);return;
  }
  if(req.method==="GET"&&
    (url.pathname==="/api/study/PuzZ0001.pgn"||
     url.pathname==="/api/study/PuzZ0002.pgn")){
   const id=url.pathname.includes("PuzZ0001")?"PuzZ0001":"PuzZ0002";
   const name=id==="PuzZ0001"?"Puzzles":"Puzzles 2";
   res.writeHead(200,{"Content-Type":"application/x-chess-pgn"});
   res.end([
    '[Event "Synthetic study preferences"]','[StudyName "'+name+'"]',
    '[ChapterName "Reviewed opening"]',
    '[ChapterURL "https://lichess.org/study/'+id+'/ChP00001"]',
    '[White "White"]','[Black "Black"]','[Result "*"]',"","*",
   ].join("\n"));return;
  }
  if(req.method==="POST"&&url.pathname==="/api/study"){
   if(!tokens.get(token)?.includes("study:write")){res.writeHead(403);res.end();return;}
   let raw="";for await(const c of req)raw+=String(c);
   const form=new URLSearchParams(raw);
   if(form.get("visibility")!=="private"||form.get("name")!=="Puzzles 3"){
    res.writeHead(400);res.end();return;
   }
   createCount++;
   studies.push({id:"PuzZ0003",name:"Puzzles 3"});
   res.writeHead(200,{"Content-Type":"application/json"});
   res.end(JSON.stringify({id:"PuzZ0003",name:"Puzzles 3"}));return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise<void>((yes,no)=>{app.once("error",no);app.listen(3999,"127.0.0.1",yes);});
 return {server:app,getCreates:()=>createCount};
}
test("PARITY:PARITY-integrated-teacher-context-student-ratings-and-fen",async({page,request})=>{
 const call=await delegatedTool(page,request);
 const ctx=await page.request.get("/api/teacher/context");
 expect(ctx.status()).toBe(200);
 const webCtx=await ctx.json();
 const mcpCtx=await call("ccp_v1_teacher_context_get",{});
 expect(mcpCtx.error).toBeUndefined();
 expect(mcpCtx.data.localDate).toBe(webCtx.localDate);
 expect(mcpCtx.data.timezone).toBe(webCtx.timezone);
 expect(mcpCtx.data.dayOfWeek).toBe(webCtx.dayOfWeek);
 const {ids}=await newTeacherStudents(call);
 const studentId=ids[0];
 const manual={provider:"lichess",timeControl:"rapid",rating:1651,
  ratingDeviation:null,provisional:null,games:null,
  observedAt:"2026-11-12T12:00:00.000Z",requestId:uuid(),confirmed:true};
 const observed=await page.request.post("/api/students/"+studentId+"/ratings",{
  data:{action:"manual",...manual},
 });
 expect(observed.status(),await observed.text()).toBe(200);
 expect((await observed.json()).replayed).toBe(false);
 const replay=await call("ccp_v1_student_ratings_record",{studentId,...manual});
 expect(replay.error).toBeUndefined();
 expect(replay.data.replayed).toBe(true);
 const history=await page.request.get("/api/students/"+studentId+"/ratings?limit=50");
 expect(history.status()).toBe(200);
 const list=await call("ccp_v1_student_ratings_list",{studentId});
 expect(list.error).toBeUndefined();
 expect(list.data).toEqual(await history.json());
 expect(list.data.snapshots).toMatchObject([{
  provider:"lichess",time_control:"rapid",rating:1651,source:"teacher_manual",
 }]);
 const unchanged=await page.request.get("/api/students/"+studentId);
 expect(unchanged.status()).toBe(200);
 expect((await unchanged.json()).strength).toBeNull();
 const foreign=await call("ccp_v1_student_ratings_list",{studentId:uuid()});
 expect(foreign.error).toBeDefined();
 const webFen=await page.request.post("/api/lichess/fen-validate",{
  data:{fen:startFen,source:"image"},
 });
 expect(webFen.status()).toBe(200);
 const fen=await webFen.json();
 expect(fen.unknownGameState).toContain("sideToMove");
 const mcpFen=await call("ccp_v1_chess_fen_validate",{fen:startFen,source:"image"});
 expect(mcpFen.error).toBeUndefined();expect(mcpFen.data).toEqual(fen);
 const impossible="4k3/8/8/8/8/8/8/4R2K w - - 0 1";
 expect((await page.request.post("/api/lichess/fen-validate",{
  data:{fen:impossible,source:"manual"},
 })).status()).toBe(400);
 expect((await call("ccp_v1_chess_fen_validate",{
  fen:impossible,source:"manual",
 })).error?.code).toBe("VALIDATION_ERROR");
});
test("PARITY:PARITY-public-lichess-and-chesscom-rating-sources-are-independent",async({page,request})=>{
 test.skip(process.env.CI!=="true"||
  process.env.CCP_SYNTHETIC_RATINGS_ORIGIN!=="http://127.0.0.1:3995",
  "Synthetic local provider is required, no real public student data");
 const server=await ratingProvider();
 try{
  const call=await delegatedTool(page,request);
  const {ids}=await newTeacherStudents(call),studentId=ids[0];
  const profile=await page.request.put("/api/students/"+studentId,{
   data:{lichessUsername:"synthetic_lichess",chesscomUsername:"synthetic_chesscom"},
  });
  expect(profile.status(),await profile.text()).toBe(200);
  for(const provider of ["lichess","chesscom"] as const){
   const web=await page.request.post("/api/students/"+studentId+"/ratings",{
    data:{action:"refreshPreview",provider,confirmedExternal:true},
   });
   expect(web.status(),await web.text()).toBe(200);
   const candidate=await web.json();
   expect(candidate.provider).toBe(provider);
   expect(candidate.teacherStrengthChanged).toBe(false);
   const mcp=await call("ccp_v1_student_ratings_refresh_preview",{
    studentId,provider,confirmedExternal:true,
   });
   expect(mcp.error).toBeUndefined();
   expect(mcp.data.expectedDigest).toBe(candidate.expectedDigest);
   expect(mcp.data.ratings.map((x:{timeControl:string;rating:number})=>
    [x.timeControl,x.rating]))
    .toEqual(candidate.ratings.map((x:{timeControl:string;rating:number})=>
     [x.timeControl,x.rating]));
   const approval={studentId,provider,expectedDigest:candidate.expectedDigest,
    requestId:uuid(),confirmed:true,confirmedExternal:true};
   const committed=await call("ccp_v1_student_ratings_refresh_commit",approval);
   expect(committed.error).toBeUndefined();
   expect(committed.data.replayed).toBe(false);
   const replay=await page.request.post("/api/students/"+studentId+"/ratings",{
    data:{action:"refreshCommit",...approval},
   });
   expect(replay.status(),await replay.text()).toBe(200);
   expect((await replay.json()).replayed).toBe(true);
   // The website accepts the same signed-off payload as MCP, but it must not
   // allow a body student ID to override the authenticated URL's student.
   const mismatched=await page.request.post("/api/students/"+studentId+"/ratings",{
    data:{action:"refreshCommit",...approval,studentId:uuid()},
   });
   expect(mismatched.status(),await mismatched.text()).toBe(400);
   expect((await mismatched.json()).error).toMatch(/student ID does not match URL/);
   const altered=await call("ccp_v1_student_ratings_refresh_commit",{
    ...approval,expectedDigest:"0".repeat(64),
   });
   expect(altered.error?.code).toBe("IDEMPOTENCY_CONFLICT");
  }
  const list=await call("ccp_v1_student_ratings_list",{studentId});
  expect(list.error).toBeUndefined();
  const snaps=list.data.snapshots as Array<{
   provider:string;time_control:string;rating:number;provisional:boolean|null;source:string;
  }>;
  expect(snaps.some(x=>x.provider==="lichess"&&x.time_control==="rapid"&&x.rating===2014)).toBe(true);
  expect(snaps.some(x=>x.provider==="lichess"&&x.time_control==="blitz"&&x.provisional===true)).toBe(true);
  expect(snaps.some(x=>x.provider==="chesscom"&&x.time_control==="rapid"&&x.rating===1878)).toBe(true);
  expect(snaps.every(x=>x.source==="provider_api")).toBe(true);
  expect((await (await page.request.get("/api/students/"+studentId)).json()).strength).toBeNull();
 }finally{await close(server);}
});
test("PARITY:PARITY-actual-lichess-chapter32-atomic-three-student-coverage",async({page,request})=>{
 const provider=await lichessStudyProvider();
 try{
  const call=await delegatedTool(page,request);
  const {workplaceId,ids,names}=await newTeacherStudents(call);
  await page.goto("/api/lichess/connect?mode=read");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  const sync=await page.request.post("/api/lichess/chapter-index",{
   data:{studyId:"StUd1234",confirmedExternal:true},
  });
  expect(sync.status(),await sync.text()).toBe(200);
  expect((await sync.json()).chapterCount).toBe(64);
  const mcpSync=await call("ccp_v1_materials_chapters_sync",{
   studyId:"StUd1234",confirmedExternal:true,
  });
  expect(mcpSync.error).toBeUndefined();
  expect(mcpSync.data.chapterCount).toBe(64);
  const query="?studyId=StUd1234&chapterNumber=32&query=Steinitz";
  const web=await page.request.get("/api/lichess/chapter-index"+query);
  expect(web.status(),await web.text()).toBe(200);
  const cached=await web.json();
  const mcp=await call("ccp_v1_materials_chapters_search",{
   studyId:"StUd1234",chapterNumber:32,query:"Steinitz",
  });
  expect(mcp.error).toBeUndefined();expect(mcp.data).toEqual(cached);
  expect(cached.matches).toHaveLength(1);
  expect(cached.matches[0]).toMatchObject({
   chapter_id:"Ch000032",chapter_number:32,
   white_player:"Steinitz",black_player:"Chigorin",stale:false,
  });
  const chapter=await call("ccp_v1_materials_chapters_get",{
   studyId:"StUd1234",chapterId:"Ch000032",
  });
  expect(chapter.error).toBeUndefined();
  const one=await page.request.get("/api/lichess/chapter-index?studyId=StUd1234&chapterId=Ch000032");
  expect(one.status(),await one.text()).toBe(200);
  expect(await one.json()).toEqual(chapter.data);
  const startsAt="2090-07-08T13:00:00.000Z";
  const capture={
   names,workplaceId,title:randomName("Classic study lesson"),
   startsAt,durationMinutes:90,lessonNote:"Teaching not yet confirmed",
   chapterSelection:{studyName:"Classic Games 2",chapterNumber:32,
    expectedPlayers:"Steinitz–Chigorin"},
  };
  const proposed=await page.request.post("/api/coaching/lesson-capture/preview",{
   data:capture,
  });
  expect(proposed.status(),await proposed.text()).toBe(200);
  const reviewed=await proposed.json();
  const delegated=await call("ccp_v1_lessons_capture_preview",capture);
  expect(delegated.error).toBeUndefined();
  expect(delegated.data).toEqual(reviewed);
  expect(reviewed.canCommit).toBe(true);
  expect(reviewed.selectedChapter).toMatchObject({
   studyId:"StUd1234",chapterId:"Ch000032",chapterNumber:32,
   studyName:"Classic Games 2",white:"Steinitz",black:"Chigorin",
   attached:false,
  });
  expect(reviewed.review.materialAssociation).toBe("not_written");
  expect(reviewed.proposedSession.studentIds).toEqual(ids);
  const session=await call("ccp_v1_sessions_ad_hoc_create",{
   ...reviewed.proposedSession,
   idempotencyKey:uuid(),confirmed:true,
  });
  expect(session.error).toBeUndefined();
  const sessionId=session.data.id as string;
  const payload={sessionId,studyId:"StUd1234",chapterId:"Ch000032",
   stage:"assigned",note:"Chapter assigned to all learners; comprehension unknown"};
  const preview=await page.request.post("/api/coaching/chapter-evidence",{
   data:{action:"preview",...payload},
  });
  expect(preview.status(),await preview.text()).toBe(200);
  const plan=await preview.json();
  expect(plan.canCommit).toBe(true);
  expect(plan.studentCoverageCount).toBe(3);
  expect(plan.uniqueWorkplaceLessonCount).toBe(1);
  const model=await call("ccp_v1_materials_link_preview",payload);
  expect(model.error).toBeUndefined();
  expect(model.data).toEqual(plan);
  const key=uuid();
  const confirmed=await call("ccp_v1_materials_link_commit",{
   ...plan.proposedCommit,requestId:key,confirmed:true,
  });
  expect(confirmed.error).toBeUndefined();
  expect(confirmed.data).toMatchObject({
   participantCoverages:3,uniqueWorkplaceLessonCount:1,inferredMastery:false,
   replayed:false,
  });
  const replay=await page.request.post("/api/coaching/chapter-evidence",{
   data:{action:"commit",...plan.proposedCommit,requestId:key,confirmed:true},
  });
  expect(replay.status(),await replay.text()).toBe(200);
  expect((await replay.json()).replayed).toBe(true);
  const history=await call("ccp_v1_materials_history_list",{sessionId});
  expect(history.error).toBeUndefined();
  expect(history.data.entries).toHaveLength(3);
  expect(history.data.pageSummary.uniqueSessionMaterialCount).toBe(1);
  const rejected=await page.request.post("/api/coaching/chapter-evidence",{
   data:{action:"preview",...payload,stage:"taught"},
  });
  expect(rejected.status()).toBe(200);
  expect((await rejected.json()).canCommit).toBe(false);
  const foreign=await call("ccp_v1_materials_chapters_get",{
   studyId:"StUd1234",chapterId:"Ch123456",
  });
  expect(foreign.error?.code).toBe("NOT_FOUND");
 }finally{
  // All Playwright specs authenticate the same seeded teacher. Never leave
  // a synthetic OAuth grant attached to a defunct mock Lichess server:
  // it poisons subsequent credential isolation and revoke assertions.
  await page.request.delete("/api/lichess/connection",{
   data:{confirmed:true},
  }).catch(()=>{});
  await close(provider.server);
 }
});
test("PARITY:PARITY-lesson-and-verified-chapter-commit-is-one-transaction-across-web-and-MCP",async({page,request})=>{
 const provider=await lichessStudyProvider();
 try{
  const call=await delegatedTool(page,request);
  const {workplaceId,ids,names}=await newTeacherStudents(call);
  await page.goto("/api/lichess/connect?mode=read");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  const sync=await page.request.post("/api/lichess/chapter-index",{
   data:{studyId:"StUd1234",confirmedExternal:true},
  });
  expect(sync.status(),await sync.text()).toBe(200);
  const payload={
   names,workplaceId,title:randomName("Atomic rook endgame"),
   startsAt:"2091-07-08T13:00:00.000Z",durationMinutes:90,
   lessonNote:"Unmarked attendance, verified chapter assignment only",
   chapterSelection:{studyId:"StUd1234",chapterNumber:32,
    expectedPlayers:"Steinitz–Chigorin"},
  };
  const webPreview=await page.request.post("/api/coaching/lesson-capture/preview",{data:payload});
  expect(webPreview.status(),await webPreview.text()).toBe(200);
  const preview=await webPreview.json();
  const mcpPreview=await call("ccp_v1_lessons_capture_preview",payload);
  expect(mcpPreview.error).toBeUndefined();
  expect(mcpPreview.data).toEqual(preview);
  expect(preview.canCommit).toBe(true);
  expect(preview.proposedAtomicCommit).toMatchObject({
   workplaceId,studentIds:ids,studyId:"StUd1234",chapterId:"Ch000032",
   durationMinutes:90,
  });
  const keys={requestId:uuid(),evidenceRequestId:uuid(),confirmed:true};
  const agreed={...preview.proposedAtomicCommit,...keys};
  const committed=await call("ccp_v1_lessons_capture_commit_with_chapter",agreed);
  expect(committed.error).toBeUndefined();
  expect(committed.data).toMatchObject({
   oneTransaction:true,replayed:false,attendance:"unmarked",inferredMastery:false,
   evidence:{participantCoverages:3,uniqueWorkplaceLessonCount:1,inferredMastery:false},
  });
  const sessionId=committed.data.session.id as string;
  expect(sessionId).toBeTruthy();
  const replay=await page.request.post("/api/coaching/lesson-capture/commit",{data:agreed});
  expect(replay.status(),await replay.text()).toBe(200);
  expect(await replay.json()).toMatchObject({
   oneTransaction:true,replayed:true,session:{id:sessionId},
   evidence:{participantCoverages:3,replayed:true},
  });
  const saved=await call("ccp_v1_sessions_details",{sessionId});
  expect(saved.error).toBeUndefined();
  expect(saved.data.duration_minutes).toBe(90);
  const attendance=await call("ccp_v1_attendance_preview",{sessionId});
  expect(attendance.error).toBeUndefined();
  expect(attendance.data.attendance).toHaveLength(3);
  expect(attendance.data.attendance.every((x:{status:string})=>x.status==="unmarked"))
   .toBe(true);
  const history=await call("ccp_v1_materials_history_list",{sessionId});
  expect(history.error).toBeUndefined();
  expect(history.data.entries).toHaveLength(3);
  expect(history.data.pageSummary.uniqueSessionMaterialCount).toBe(1);

  const reused=await page.request.post("/api/coaching/lesson-capture/commit",{
   data:{...agreed,title:"Rebound title"},
  });
  expect(reused.status(),await reused.text()).toBe(409);

  // Failed verified-source version must ROLLBACK both the new lesson and
  // material assignment, not leave a ghost session with unlinked chapter.
  const staleTitle=randomName("Rollback stale chapter");
  const stale=await call("ccp_v1_lessons_capture_commit_with_chapter",{
   ...agreed,requestId:uuid(),evidenceRequestId:uuid(),title:staleTitle,
   startsAt:"2091-07-08T16:00:00.000Z",
   expectedVerifiedAt:"2000-01-01T00:00:00.000Z",
  });
  expect(stale.error?.code).toBe("CONFLICT");
  const missing=await call("ccp_v1_sessions_list",{query:staleTitle,workplaceId});
  expect(missing.error).toBeUndefined();
  expect((missing.data as Array<{title:string}>).some(x=>x.title===staleTitle)).toBe(false);
  const invalid=await page.request.post("/api/coaching/lesson-capture/commit",{
   data:{...agreed,evidenceRequestId:keys.requestId},
  });
  expect(invalid.status(),await invalid.text()).toBe(400);
 }finally{
  await page.request.delete("/api/lichess/connection",{data:{confirmed:true}}).catch(()=>{});
  await close(provider.server);
 }
});
test("PARITY:PARITY-student-workplace-teacher-lichess-preferences-resolve-and-correct-across-website-MCP",async({page,request})=>{
 const mock=await lichessStudyProvider();
 try{
  const call=await delegatedTool(page,request);
  const {workplaceId,ids,names}=await newTeacherStudents(call);
  await page.goto("/api/lichess/connect?mode=read");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  for(const studyId of ["StUd1234","PuzZ0001","PuzZ0002"]){
   const index=await page.request.post("/api/lichess/chapter-index",{
    data:{studyId,confirmedExternal:true},
   });
   expect(index.status(),await index.text()).toBe(200);
  }
  const ctx=await (await page.request.get("/api/teacher/context")).json();
  const teacherId=ctx.teacherId as string;
  expect(teacherId).toMatch(/^[0-9a-f-]{36}$/);
  const base={purpose:"lesson" as const,expectedRevision:0,confirmed:true};
  const teacherApproval={...base,scope:"teacher" as const,scopeId:teacherId,
   studyId:"StUd1234",requestId:uuid()};
  const teacher=await call("ccp_v1_materials_preferences_set",teacherApproval);
  expect(teacher.error).toBeUndefined();
  expect(teacher.data).toMatchObject({studyId:"StUd1234",revision:1,replayed:false});
  const exactReplay=await page.request.post("/api/lichess/study-preferences",{
   data:{action:"set",...teacherApproval},
  });
  expect(exactReplay.status(),await exactReplay.text()).toBe(200);
  expect((await exactReplay.json()).replayed).toBe(true);

  const workplaceApproval={...base,scope:"workplace" as const,
   scopeId:workplaceId,studyId:"PuzZ0001",requestId:uuid()};
  const workplace=await page.request.post("/api/lichess/study-preferences",{
   data:{action:"set",...workplaceApproval},
  });
  expect(workplace.status(),await workplace.text()).toBe(200);
  expect((await workplace.json()).revision).toBe(1);
  const afterWorkplace=await call("ccp_v1_materials_preferences_resolve",{
   purpose:"lesson",workplaceId,studentId:ids[0],
  });
  expect(afterWorkplace.error).toBeUndefined();
  expect(afterWorkplace.data).toMatchObject({
   studyId:"PuzZ0001",selectedScope:"workplace",needsSync:false,
  });

  const studentApproval={...base,scope:"student" as const,
   scopeId:ids[0],studyId:"PuzZ0002",requestId:uuid()};
  const student=await call("ccp_v1_materials_preferences_set",studentApproval);
  expect(student.error).toBeUndefined();
  expect(student.data.studyId).toBe("PuzZ0002");
  const resolver=new URLSearchParams({action:"resolve",purpose:"lesson",
   workplaceId,studentId:ids[0]});
  const web=await page.request.get("/api/lichess/study-preferences?"+resolver);
  expect(web.status(),await web.text()).toBe(200);
  expect(await web.json()).toMatchObject({
   studyId:"PuzZ0002",selectedScope:"student",needsSync:false,
  });
  const listWeb=await page.request.get(
   "/api/lichess/study-preferences?action=list&purpose=lesson&limit=50");
  expect(listWeb.status(),await listWeb.text()).toBe(200);
  const listMcp=await call("ccp_v1_materials_preferences_list",{purpose:"lesson"});
  expect(listMcp.error).toBeUndefined();
  expect(listMcp.data).toEqual(await listWeb.json());

  const invalid=await page.request.post("/api/lichess/study-preferences",{
   data:{action:"set",...studentApproval,requestId:uuid(),
    studyId:"PuzZ0001",expectedRevision:0},
  });
  expect(invalid.status(),await invalid.text()).toBe(409);
  const foreign=await call("ccp_v1_materials_preferences_set",{
   ...studentApproval,scopeId:uuid(),requestId:uuid(),
  });
  expect(foreign.error?.code).toBe("NOT_FOUND");

  // Different per-learner defaults must NOT be silently collapsed into the
  // first student's study during a three-person captured lesson.
  const proposed={names,workplaceId,title:randomName("Preferred study lesson"),
   startsAt:"2092-07-08T13:00:00.000Z",durationMinutes:90,lessonNote:"",
   chapterSelection:{chapterNumber:1}};
  const ambiguous=await call("ccp_v1_lessons_capture_preview",proposed);
  expect(ambiguous.error).toBeUndefined();
  expect(ambiguous.data.canCommit).toBe(false);
  expect(ambiguous.data.issues.some((x:{code:string})=>x.code==="CHAPTER_AMBIGUOUS"))
   .toBe(true);
  const clearStudent=await page.request.post("/api/lichess/study-preferences",{
   data:{action:"set",purpose:"lesson",scope:"student",scopeId:ids[0],
    studyId:null,expectedRevision:1,requestId:uuid(),confirmed:true},
  });
  expect(clearStudent.status(),await clearStudent.text()).toBe(200);
  expect((await clearStudent.json()).revision).toBe(0);
  const shared=await page.request.post("/api/coaching/lesson-capture/preview",{
   data:proposed,
  });
  expect(shared.status(),await shared.text()).toBe(200);
  const resolved=await shared.json();
  expect(resolved.canCommit).toBe(true);
  expect(resolved.selectedChapter).toMatchObject({studyId:"PuzZ0001",
   chapterId:"ChP00001",attached:false});
  expect(resolved.review.writesPerformed).toBe(false);
  expect((await call("ccp_v1_lessons_capture_preview",proposed)).data).toEqual(resolved);
  const clearWorkplace=await call("ccp_v1_materials_preferences_set",{
   purpose:"lesson",scope:"workplace",scopeId:workplaceId,studyId:null,
   expectedRevision:1,requestId:uuid(),confirmed:true,
  });
  expect(clearWorkplace.error).toBeUndefined();
  const teacherFallback=await call("ccp_v1_materials_preferences_resolve",{
   purpose:"lesson",workplaceId,studentId:ids[0],
  });
  expect(teacherFallback.error).toBeUndefined();
  expect(teacherFallback.data).toMatchObject({
   studyId:"StUd1234",selectedScope:"teacher",needsSync:false,
  });
  expect((await call("ccp_v1_materials_preferences_resolve",{
   purpose:"lesson",workplaceId:uuid(),studentId:ids[0],
  })).error?.code).toBe("NOT_FOUND");
  // Preferences do not alter progress, mastery, attendance or lesson history.
  const sessions=await call("ccp_v1_sessions_list",{query:proposed.title,workplaceId});
  expect(sessions.error).toBeUndefined();
  expect((sessions.data as Array<{title:string}>)
   .some(x=>x.title===proposed.title)).toBe(false);
 }finally{
  await page.request.delete("/api/lichess/connection",{data:{confirmed:true}}).catch(()=>{});
  await close(mock.server);
 }
});

test("PARITY:PARITY-puzzles-study-capacity-and-private-numbered-series",async({page,request})=>{
 const provider=await lichessStudyProvider();
 try{
  const call=await delegatedTool(page,request);
  await page.goto("/api/lichess/connect?mode=write");
  await page.waitForURL(u=>u.pathname==="/learning"&&u.searchParams.get("lichess")==="connected");
  const web=await page.request.get("/api/lichess/puzzle-series");
  expect(web.status(),await web.text()).toBe(200);
  const series=await web.json();
  expect(series.nextName).toBe("Puzzles 3");
  const mcp=await call("ccp_v1_puzzles_study_series_list",{});
  expect(mcp.error).toBeUndefined();
  expect(mcp.data.nextName).toBe(series.nextName);
  const capacity=await page.request.get("/api/lichess/puzzle-series?studyId=StUd1234");
  expect(capacity.status(),await capacity.text()).toBe(200);
  expect(await capacity.json()).toMatchObject({
   chapterCount:64,maxChapters:64,availableChapters:0,
   canPublish:false,rolloverRequired:true,
  });
  const mcpCapacity=await call("ccp_v1_puzzles_study_capacity",{studyId:"StUd1234"});
  expect(mcpCapacity.error).toBeUndefined();
  expect(mcpCapacity.data).toEqual(await capacity.json());
  // A 64/64 destination is rejected before POST /import-pgn, even when
  // study:write authorization exists. It must not create a duplicate chapter.
  const puzzle={studyId:"StUd1234",chapterName:"Capacity guarded position",
    fen:startFen,moves:"1. e4 e5",orientation:"white"};
  const review=await call("ccp_v1_lichess_puzzle_preview",puzzle);
  expect(review.error).toBeUndefined();
  const denied=await call("ccp_v1_lichess_puzzle_publish",{
   ...puzzle,expectedSha256:review.data.sha256,
   idempotencyKey:uuid(),confirmed:true,confirmedExternal:true,
  });
  expect(denied.error?.code).toBe("CAPACITY_REACHED");
  const requestId=uuid();
  const approved={expectedName:"Puzzles 3",requestId,confirmed:true,
   confirmedExternal:true};
  const created=await page.request.post("/api/lichess/puzzle-series",{
   data:{action:"create",...approved},
  });
  expect(created.status(),await created.text()).toBe(200);
  expect(await created.json()).toMatchObject({
   name:"Puzzles 3",studyId:"PuzZ0003",private:true,starterChapterCount:1,
  });
  expect(provider.getCreates()).toBe(1);
  const noRepeat=await call("ccp_v1_puzzles_study_create",approved);
  expect(noRepeat.error).toBeDefined();
  expect(provider.getCreates()).toBe(1);
  const reconcile=await call("ccp_v1_puzzles_study_reconcile",{
   requestId,confirmed:true,confirmedExternal:true,
  });
  expect(reconcile.error).toBeUndefined();
  expect(reconcile.data.studyId).toBe("PuzZ0003");
  expect(provider.getCreates()).toBe(1);
 }finally{
  // All Playwright specs authenticate the same seeded teacher. Never leave
  // a synthetic OAuth grant attached to a defunct mock Lichess server:
  // it poisons subsequent credential isolation and revoke assertions.
  await page.request.delete("/api/lichess/connection",{
   data:{confirmed:true},
  }).catch(()=>{});
  await close(provider.server);
 }
});
