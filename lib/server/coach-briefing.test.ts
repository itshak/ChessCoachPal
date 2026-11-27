import type {SupabaseClient} from "@supabase/supabase-js";
import {afterEach,describe,expect,it,vi} from "vitest";

const {policy,history}=vi.hoisted(()=>({
 policy:vi.fn(async()=>({timezone:"Asia/Jerusalem"})),
 history:vi.fn(async(_db:unknown,_teacher:string,_range:unknown,context?:{teacherTimezone?:string})=>({
  filter:{timezone:context?.teacherTimezone??"Asia/Jerusalem"},entries:[],total:0,
 })),
}));

vi.mock("server-only",()=>({}));
vi.mock("@/lib/server/scheduling",()=>({getPolicy:policy}));
vi.mock("@/lib/server/unified-lesson-service",()=>({teacherUnifiedLessonHistory:history}));
vi.mock("@/lib/server/teacher-material-history",()=>({teacherMaterialHistory:async()=>({entries:[],total:0})}));
vi.mock("@/lib/server/training-assignments",()=>({teacherAssignmentsList:async()=>({assignments:[],total:0})}));
vi.mock("@/lib/server/student-training-plans",()=>({teacherTrainingPlansList:async()=>({plans:[],total:0})}));

import {teacherCoachBriefing} from "./coach-briefing";

function fixture(){
 const query={
  select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),
  maybeSingle:vi.fn(async()=>({data:{id:"learner",name:"Synthetic learner",archived_at:null},error:null})),
  not:vi.fn().mockReturnThis(),gte:vi.fn().mockReturnThis(),lt:vi.fn().mockReturnThis(),
  order:vi.fn().mockReturnThis(),limit:vi.fn(async()=>({data:[],error:null})),
 };
 const db={from:vi.fn(()=>query)} as unknown as SupabaseClient;
 return {db,query};
}

afterEach(()=>{
 vi.useRealTimers();
 vi.clearAllMocks();
});

describe("coach briefing default civil dates",()=>{
 it.each([
  ["2025-03-29T21:30:00Z","Asia/Jerusalem",{},"2024-12-30","2025-03-30","2025-03-30T21:00:00.000Z"],
  ["2025-03-30T03:30:00Z","America/Los_Angeles",{from:"2025-03-25"},
   "2025-03-25","2025-03-29","2025-03-30T07:00:00.000Z"],
  ["2025-03-29T21:30:00Z","Asia/Jerusalem",{to:"2025-03-29"},
   "2024-12-30","2025-03-29","2025-03-29T21:00:00.000Z"],
 ] as const)("uses the teacher calendar for omitted bounds (%s, %s, %o)",async(at,timezone,bounds,from,to,end)=>{
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  policy.mockResolvedValueOnce({timezone});
  const {db,query}=fixture();
  const result=await teacherCoachBriefing(db,"teacher",{studentId:"learner",limit:2,...bounds});
  expect(policy).toHaveBeenCalledExactlyOnceWith(db,"teacher");
  expect(history).toHaveBeenCalledExactlyOnceWith(db,"teacher",{
   studentId:"learner",workplaceId:null,from,to,offset:0,limit:2,
  },{teacherTimezone:timezone});
  expect(result.range).toEqual({from,to,timezone});
  expect(query.lt).toHaveBeenCalledWith("observed_at",end);
 });

 it("does not load a separate policy or change explicit dates",async()=>{
  const {db}=fixture();
  const from="2025-03-28",to="2025-03-29";
  const result=await teacherCoachBriefing(db,"teacher",{studentId:"learner",limit:2,from,to});
  expect(policy).not.toHaveBeenCalled();
  expect(result.range).toEqual({from,to,timezone:"Asia/Jerusalem"});
 });
});
