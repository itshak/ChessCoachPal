import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {configureSyntheticStudentCapacity} from "./helpers/normalized-entitlements";

test("PARITY:PARITY-online-rating-consent confirms the same account across signed website and delegated MCP",async({page,request})=>{
 test.setTimeout(120_000);
 const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const ids:string[]=[];
 const password="Synthetic-Automatic-Rating-123!";
 async function tenant(){
  const email="automatic-rating-"+randomUUID()+"@example.invalid";
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
  expect(result.error).toBeNull();
  const id=result.data.user!.id;
  ids.push(id);
  expect((await admin.from("teachers").insert({
    id,email,display_name:"Synthetic rating teacher",preferred_locale:"en",
    onboarding_tour_completed_at:new Date().toISOString(),
  })).error).toBeNull();
  await configureSyntheticStudentCapacity(admin,id,20,2);
  const student=await admin.from("students").insert({
   teacher_id:id,name:"Synthetic automatic-rating learner",
   lichess_username:"SyntheticAlpha",chesscom_username:"SyntheticBeta",
  }).select("id").single();
  expect(student.error).toBeNull();
  return {email,id,studentId:student.data!.id as string};
 }
 try{
  const owner=await tenant(),other=await tenant();
  const path="/api/students/"+owner.studentId+"/ratings/consent";
  const foreignPath="/api/students/"+other.studentId+"/ratings/consent";
  const readName="ccp_student_ratings_consent_get",writeName="ccp_student_ratings_consent_set";
  const input={studentId:owner.studentId,provider:"lichess"};
  const invoke=await delegatedTool(page,request,"coach:read coach:write",{email:owner.email,password});
  const names=(await invoke.listTools()).map(tool=>tool.name);
  expect(names).toContain(readName);
  expect(names).toContain(writeName);
  await page.goto("/students/"+owner.studentId+"#automatic-ratings");
  const lichess=page.locator("#automatic-ratings").getByRole("region",{name:"Lichess",exact:true});
  const chesscom=page.locator("#automatic-ratings").getByRole("region",{name:"Chess.com",exact:true});
  await expect(lichess.getByText("Permission off",{exact:true})).toBeVisible();
  await expect(chesscom.getByText("Permission off",{exact:true})).toBeVisible();
  const signed=page.request;
  const origin=new URL(page.url()).origin;
  const read=async(name:"lichess"|"chesscom")=>{
   const response=await signed.get(path+"?provider="+name);
   expect(response.status(),await response.text()).toBe(200);
   expect(response.headers()["cache-control"]).toBe("private, no-store");
   const result=await response.json();
   const mcp=await invoke(readName,{...input,provider:name});
   expect(mcp.error).toBeUndefined();
   expect(mcp.data).toEqual(result);
   return result;
  };
  const initial=await read("lichess");
  expect(initial).toMatchObject({username:"SyntheticAlpha",enabled:false,expectedRevision:0,canChange:true});
  const proposed={...input,username:initial.username,studentEpoch:initial.studentEpoch,
   expectedRevision:initial.expectedRevision,enable:true,requestId:randomUUID()};
  const post=(data:Record<string,unknown>,customOrigin=origin,url=path)=>signed.post(url,{
   headers:{Origin:customOrigin,"Content-Type":"application/json"},data,
  });
  expect((await post({...proposed,confirmed:true},"https://outside.example.invalid")).status()).toBe(403);
  expect((await post({...proposed,confirmed:false})).status()).toBe(400);
  expect((await invoke(writeName,{...proposed,confirmed:false})).error?.code).toBe("VALIDATION_ERROR");
  expect((await signed.get(foreignPath+"?provider=lichess")).status()).toBe(404);
  expect((await invoke(readName,{...input,studentId:other.studentId})).error?.code).toBe("NOT_FOUND");
  expect((await post({...proposed,studentId:other.studentId,confirmed:true},origin,foreignPath)).status()).toBe(404);
  expect((await invoke(writeName,{...proposed,studentId:other.studentId,confirmed:true})).error?.code).toBe("NOT_FOUND");
  let jobs=await admin.from("student_rating_refresh_jobs").select("id").in("teacher_id",ids);
  expect(jobs.error).toBeNull();
  expect(jobs.data).toEqual([]);
  await lichess.getByRole("button",{name:"Review turning on",exact:true}).click();
  await expect(lichess.getByText(/Allow background public rating requests for SyntheticAlpha on Lichess/)).toBeVisible();
  const wire=page.waitForRequest(req=>req.method()==="POST"&&new URL(req.url()).pathname===path);
  const webReply=page.waitForResponse(res=>res.request().method()==="POST"&&new URL(res.url()).pathname===path);
  await lichess.getByRole("button",{name:"Allow automatic ratings",exact:true}).click();
  const reviewed=(await wire).postDataJSON() as Record<string,unknown>;
  const accepted=await webReply;
  // Assert the browser response status and real rendered state, then read
  // the persisted job independently. Reading the browser-captured response
  // stream again can hang with the production service-worker instrumentation.
  expect(accepted.status()).toBe(200);
  await expect(lichess.getByText("Permission on",{exact:true})).toBeVisible();
  const queued=await admin.from("student_rating_refresh_jobs").select("id").eq("teacher_id",owner.id)
   .eq("idempotency_key",reviewed.requestId).single();
  expect(queued.error).toBeNull();
  const saved={...input,status:"accepted",jobId:queued.data!.id as string};
  const replay=await invoke(writeName,reviewed);
  expect(replay.error).toBeUndefined();
  expect(replay.data).toEqual({...saved,replayed:true});
  const enabled=await read("lichess");
  expect(enabled).toMatchObject({enabled:true,expectedRevision:1});
  expect(await read("chesscom")).toMatchObject({enabled:false,expectedRevision:0});
  const revoke={...input,username:enabled.username,studentEpoch:enabled.studentEpoch,expectedRevision:enabled.expectedRevision,
   requestId:randomUUID(),enable:false,confirmed:true};
  const declined=await invoke(writeName,revoke);
  expect(declined.error).toBeUndefined();
  expect(declined.data).toMatchObject({status:"revoked",replayed:false});
  const repeatRevoke=await post(revoke);
  expect(repeatRevoke.status(),await repeatRevoke.text()).toBe(200);
  expect(await repeatRevoke.json()).toEqual({...declined.data,replayed:true});
  expect((await invoke(writeName,reviewed)).data).toEqual({...saved,replayed:true});
  expect(await read("lichess")).toMatchObject({enabled:false,expectedRevision:2});
  jobs=await admin.from("student_rating_refresh_jobs").select("id").in("teacher_id",ids);
  expect(jobs.error).toBeNull();
  expect(jobs.data).toEqual([{id:saved.jobId}]);
  const pending=await admin.from("student_rating_refresh_jobs").select("attempt_count").eq("id",saved.jobId).single();
  expect(pending.error).toBeNull();
  expect(pending.data).toEqual({attempt_count:0});
  const receipts=await admin.from("student_rating_refresh_receipts").select("id").in("teacher_id",ids);
  expect(receipts.error).toBeNull();
  expect(receipts.data).toEqual([]);
 }finally{
  for(const id of ids)await admin.auth.admin.deleteUser(id);
 }
});
