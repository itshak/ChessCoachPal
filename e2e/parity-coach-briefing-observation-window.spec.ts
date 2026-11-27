import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {expect} from "@playwright/test";
import {delegatedTool} from "./helpers/delegated-mcp";
import {isolatedTeacherTest} from "./helpers/isolated-teacher";

isolatedTeacherTest("PARITY: coach briefing limits verified observations to the requested teacher-local dates",async({
 page,request,isolatedTeacher,
})=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
 expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(url).hostname);
 const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
  auth:{persistSession:false,autoRefreshToken:false},
 });
 const read=await delegatedTool(page,request,"coach:read",isolatedTeacher);
 const context=await page.request.get("/api/teacher/context");
 expect(context.status(),await context.text()).toBe(200);
 const teacherId=(await context.json()).teacherId as string;
 expect((await admin.from("teacher_settings").upsert({
  teacher_id:teacherId,timezone:"Asia/Jerusalem",
 })).error).toBeNull();
 const learners=await admin.from("students").insert([
  {teacher_id:teacherId,name:"Briefing evidence learner"},
  {teacher_id:teacherId,name:"Other briefing learner"},
 ]).select("id,name");
 expect(learners.error).toBeNull();
 const studentId=learners.data!.find(row=>row.name==="Briefing evidence learner")!.id as string;
 const other=learners.data!.find(row=>row.name==="Other briefing learner")!.id as string;
 const category=await admin.from("chess_skill_categories").select("id").eq("teacher_id",teacherId).eq("name","Endgames").single();
 expect(category.error).toBeNull();
 const start=randomUUID(),endA=randomUUID(),endB=randomUUID();
 const verifiedAt="2025-04-01T12:00:00.000Z";
 const verified={teacher_id:teacherId,student_id:studentId,category_id:category.data!.id,
  source:"teacher",verified_at:verifiedAt,verified_by:teacherId};
 // Jerusalem's spring-forward day is 23 hours long: [22:00Z, 21:00Z).
 const end="2025-03-28T20:59:59.999Z";
 const rows=await admin.from("chess_observations").insert([
  {...verified,id:start,observation:"Included at local midnight",observed_at:"2025-03-27T22:00:00.000Z"},
  {...verified,id:endA,observation:"Included last part of day A",observed_at:end},
  {...verified,id:endB,observation:"Included last part of day B",observed_at:end},
  {...verified,id:randomUUID(),observation:"Excluded before local midnight",observed_at:"2025-03-27T21:59:59.999Z"},
  {...verified,id:randomUUID(),observation:"Excluded at following local midnight",observed_at:"2025-03-28T21:00:00.000Z"},
  {...verified,id:randomUUID(),observation:"Excluded later verified observation",observed_at:"2025-04-10T10:00:00.000Z",verified_at:"2025-04-10T12:00:00.000Z"},
  {...verified,id:randomUUID(),student_id:other,observation:"Excluded other learner",observed_at:end},
  {...verified,id:randomUUID(),source:"agent",verified_at:null,verified_by:null,
   observation:"Excluded unverified suggestion",observed_at:end},
 ]);
 expect(rows.error).toBeNull();
 async function briefing(date:string,limit:number){
  const input={studentId,from:date,to:date,limit};
  const web=await page.request.get("/api/coaching/briefing?"+
    new URLSearchParams({studentId,from:date,to:date,limit:String(limit)}));
  expect(web.status(),await web.text()).toBe(200);
  const result=await web.json();
  const mcp=await read("ccp_coach_briefing_get",input);
  expect(mcp.error).toBeUndefined();
  expect(mcp.data).toEqual(result);
  return result;
 }
 const result=await briefing("2025-03-28",3);
 const tied=[endA,endB].sort();
 expect(result.range).toEqual({from:"2025-03-28",to:"2025-03-28",timezone:"Asia/Jerusalem"});
 expect(result.verifiedObservations.map((row:{id:string})=>row.id)).toEqual([...tied,start]);
 expect(result.basis).toBe("stored_teacher_owned_records_no_inferred_mastery");
 expect((await briefing("2025-03-28",1)).verifiedObservations.map((row:{id:string})=>row.id))
  .toEqual(tied.slice(0,1));
 const empty=await briefing("2025-03-30",3);
 expect(empty.verifiedObservations).toEqual([]);
 expect(empty.unknowns).toContain("No verified chess observations are recorded in this briefing window.");
 const stored=await admin.from("chess_observations").select("id",{count:"exact",head:true})
  .eq("teacher_id",teacherId);
 expect(stored.error).toBeNull();
 expect(stored.count).toBe(8);
});
