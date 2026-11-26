import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect,test} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";

test("PARITY:online ratings freshness distinguishes filtered history, current evidence and revoked identity",async({page,request})=>{
 const url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
 expect(url.protocol).toBe("http:");
 expect(url.hostname).toBe("127.0.0.1");
 const db=createClient(url.origin,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const invoke=await delegatedTool(page,request);
 const made=await invoke("ccp_students_create",{name:"Online freshness "+randomUUID(),idempotencyKey:randomUUID()});
 expect(made.error).toBeUndefined();
 const studentId=made.data.entityId as string;
 const ratingPath="/api/students/"+studentId+"/ratings";
 const reportPath="/api/coaching/student-progress?studentId="+studentId;
 const subject="/api/students/"+studentId;
 const owner=await db.from("students").select("teacher_id").eq("id",studentId).single();
 expect(owner.error).toBeNull();
 const teacherId=owner.data!.teacher_id as string;
 const handles={lichess:"FreshFixturePlayer",chesscom:"StaleFixturePlayer"};
 const hoursAgo=(hours:number)=>new Date(Date.now()-hours*3_600_000).toISOString();
 const ages={lichess:2,chesscom:60};
 try{
  const setHandles=async(lichessUsername:string)=>{
   const edited=await page.request.put(subject,{data:{lichessUsername,chesscomUsername:handles.chesscom,strength:8}});
   expect(edited.status(),await edited.text()).toBe(200);
  };
  await setHandles(handles.lichess);
  for(const provider of ["lichess","chesscom"] as const){
   const binding=await db.from("student_rating_sync_consents").insert({
    teacher_id:teacherId,student_id:studentId,provider,handle_revision:3,enabled:true,
    source_username:handles[provider],consented_at:hoursAgo(96),
   });
   expect(binding.error).toBeNull();
   const saved=await db.from("student_rating_snapshots").insert({
    teacher_id:teacherId,student_id:studentId,provider,time_control:"rapid",rating:1720,
    source:"provider_api",source_username:handles[provider],source_handle_revision:3,
    observed_at:hoursAgo(120),fetched_at:hoursAgo(ages[provider]),request_id:randomUUID(),preview_digest:"a".repeat(64),
   });
   expect(saved.error).toBeNull();
  }
  // A newer observation from an earlier account revision must remain history,
  // and must not win in the current status, scalar or categorized report.
  const replaced=await db.from("student_rating_snapshots").insert({
   teacher_id:teacherId,student_id:studentId,provider:"lichess",time_control:"rapid",rating:2500,
   source:"provider_api",source_username:handles.lichess,source_handle_revision:2,
   observed_at:hoursAgo(1),fetched_at:hoursAgo(1),request_id:randomUUID(),preview_digest:"b".repeat(64),
  });
  expect(replaced.error).toBeNull();
  async function read(path:string,tool:string,args:Record<string,unknown>){
   const response=await page.request.get(path);
   expect(response.status(),await response.text()).toBe(200);
   const data=await response.json();
   const mcp=await invoke(tool,{studentId,...args});
   expect(mcp.error).toBeUndefined();
   expect(mcp.data).toEqual(data);
   return data;
  }
  const list="ccp_student_ratings_list";
  const visible=await read(ratingPath+"?limit=1",list,{limit:1});
  expect(visible).toMatchObject({total:3,nextOffset:1,snapshots:[{rating:2500}],providerFreshness:[
   {provider:"lichess",status:"recent",lastObservation:{timeControl:"rapid"}},
   {provider:"chesscom",status:"stale",lastObservation:{timeControl:"rapid"}},
  ]});
  const empty=await read(ratingPath+"?provider=lichess&timeControl=bullet",list,{provider:"lichess",timeControl:"bullet"});
  expect(empty.total).toBe(0);
  expect(empty.providerFreshness).toEqual(visible.providerFreshness);
  expect(JSON.stringify(visible.providerFreshness)).not.toContain(handles.lichess);
  const report=await read(reportPath,"ccp_reports_student_progress",{});
  expect(report.providerFreshness).toEqual(visible.providerFreshness);
  expect(report.student).toMatchObject({lichessRating:1720,chesscomRating:1720,strength:8});
  expect(report.latestPlatformRatings).toHaveLength(2);
  expect(report.latestPlatformRatings.every((row:{rating:number})=>row.rating===1720)).toBe(true);
  await page.goto("/students/"+studentId);
  const panel=page.getByRole("region",{name:"Online chess rating history",exact:true});
  await expect(panel.getByText(/Lichess: Recently checked/)).toBeVisible();
  await expect(panel.getByText(/Chess.com: Check is at least 48 hours old/)).toBeVisible();
  const lichess=page.locator("#automatic-ratings").getByRole("region",{name:"Lichess",exact:true});
  await lichess.getByRole("button",{name:"Review turning off",exact:true}).click();
  await lichess.getByRole("button",{name:"Turn off automatic ratings",exact:true}).click();
  await expect(panel.getByText(/Lichess: Automatic checks not permitted/)).toBeVisible();
  // Edit away and back, then sign a fresh permission under the new epoch.
  await setHandles("DifferentPublicAccount");
  await setHandles(handles.lichess);
  const consent=await invoke("ccp_student_ratings_consent_get",{studentId,provider:"lichess"});
  expect(consent.error).toBeUndefined();
  const enable=await invoke("ccp_student_ratings_consent_set",{
   studentId,provider:"lichess",username:handles.lichess,studentEpoch:consent.data.studentEpoch,
   expectedRevision:consent.data.expectedRevision,enable:true,requestId:randomUUID(),confirmed:true,
  });
  expect(enable.error).toBeUndefined();
  const next=await read(reportPath,"ccp_reports_student_progress",{});
  expect(next.providerFreshness).toEqual([
   {provider:"lichess",status:"no_observation",lastObservation:null},visible.providerFreshness[1],
  ]);
  expect(next.student).toMatchObject({lichessRating:null,chesscomRating:1720,strength:8});
  const old=await read(ratingPath+"?provider=lichess",list,{provider:"lichess"});
  expect(old.snapshots.map((row:{rating:number})=>row.rating)).toEqual([2500,1720]);
  const foreign="00000000-0000-4000-8000-000000000001";
  expect((await page.request.get("/api/students/"+foreign+"/ratings")).status()).toBe(404);
  expect((await invoke(list,{studentId:foreign})).error?.code).toBe("NOT_FOUND");
 }finally{
  await db.from("student_rating_snapshots").delete().eq("teacher_id",teacherId).eq("student_id",studentId);
 }
});
