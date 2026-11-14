import {describe,expect,it} from "vitest";
import {trainingPlanCommitSchema,trainingPlanListSchema} from "./student-training-plans";

const studentId="73f7e964-98f0-4c12-a4f7-9a23c1449a10";
const goalId="ab27a2f2-0666-498b-8e2b-0640982060b4";
const requestId="fab5cde7-b4ad-47f7-91e2-caa0e27f3b5a";
const base={studentId,title:"Opposition",summary:"",status:"active",
  goals:[{id:goalId,title:"Rook study",status:"planned",targetDate:null,coachEvidence:null}],
  requestId,confirmed:true};
describe("Explicit chess training plan and goal contracts",()=>{
 it("validates a simple confirmed coach-authored plan",()=>{
   expect(trainingPlanCommitSchema.safeParse(base).success).toBe(true);
   expect(trainingPlanListSchema.safeParse({studentId}).success).toBe(true);
 });
 it("rejects guessed goal mastery and an incomplete completed plan",()=>{
   const accomplished={...base,goals:[{
     ...base.goals[0],status:"achieved",coachEvidence:null,
   }]};
   expect(trainingPlanCommitSchema.safeParse(accomplished).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...base,status:"completed"}).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...accomplished,
     goals:[{...accomplished.goals[0],coachEvidence:"Teacher observed correct technique."}]}).success).toBe(true);
 });
 it("rejects duplicate goals, made-up keys and unguarded edits",()=>{
   expect(trainingPlanCommitSchema.safeParse({...base,goals:[base.goals[0],base.goals[0]]}).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...base,confirmed:false}).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...base,planId:requestId}).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...base,expectedRevision:1}).success).toBe(false);
   expect(trainingPlanCommitSchema.safeParse({...base,planId:requestId,expectedRevision:1}).success).toBe(true);
   expect(trainingPlanCommitSchema.safeParse({...base,secret:"injected"}).success).toBe(false);
 });
});
