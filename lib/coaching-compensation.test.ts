import {describe,it,expect} from "vitest";
import {calculateExpectedCompensation,type CompensationAgreement,
 type CompensationOccurrence} from "./coaching-compensation";
const agreement:CompensationAgreement={id:"agreement-1",workplaceId:"club",model:"hourly",
 rateCents:12000,currency:"ILS",effectiveFrom:"2026-01-01",effectiveTo:null};
const pupils=Array.from({length:8},(_,i)=>`student-${i}`);
const session:CompensationOccurrence={id:"session-1",workplaceId:"club",
 lessonDate:"2026-11-18",durationMinutes:90,status:"completed",
 participantIds:pupils,markedStudentIds:pupils,attendedStudentIds:pupils};
const calculate=(a=agreement,s=[session])=>
 calculateExpectedCompensation(a,s,"2026-11-01","2026-11-30");
describe("provider-independent expected coach compensation",()=>{
 it("8 pupils, 90 instructor minutes, 120 ILS/hour = one 180 ILS earning",()=>{
  expect(calculate()).toMatchObject({eligibleSessionCount:1,
    eligibleInstructorMinutes:90,eligibleParticipantCount:8,
    expectedCents:18000});
 });
 it("a per-session coach earns once regardless of headcount",()=>{
  expect(calculate({...agreement,model:"per_session",rateCents:8500}).expectedCents).toBe(8500);
 });
 it("per-student rates use only explicit attendance, not an inferred full group",()=>{
  expect(calculate({...agreement,model:"per_student",rateCents:1000},
    [{...session,attendedStudentIds:pupils.slice(0,3)}]).expectedCents).toBe(3000);
 });
 it("completed but unmarked or partly marked roster is not teacher-verified income",()=>{
  const unmarked={...session,id:"unmarked",markedStudentIds:[],attendedStudentIds:[]};
  const partlyMarked={...session,id:"partial",markedStudentIds:pupils.slice(0,3),
   attendedStudentIds:pupils.slice(0,3)};
  const noShowOnly={...session,id:"no-show",attendedStudentIds:[]};
  const result=calculate(agreement,[unmarked,partlyMarked,noShowOnly]);
  expect(result).toMatchObject({eligibleSessionCount:0,
   eligibleParticipantCount:0,eligibleInstructorMinutes:0,
   expectedCents:0,unconfirmedSessionCount:3});
 });
 it("rejects invented, duplicate or off-roster attendance marks",()=>{
  expect(()=>calculate(agreement,[{...session,markedStudentIds:[...pupils,pupils[0]]}]))
   .toThrow("Duplicate marked attendance");
  expect(()=>calculate(agreement,[{...session,markedStudentIds:["foreign"],attendedStudentIds:[]}]))
   .toThrow("Unrecognized pupil in marked attendance");
  expect(()=>calculate(agreement,[{...session,attendedStudentIds:["foreign"]}]))
   .toThrow("Unrecognized pupil in recorded attendance");
 });
 it("cancelled or merely scheduled sessions accrue no earned work",()=>{
  const sessions=[{...session,status:"scheduled" as const},
   {...session,id:"session-2",status:"cancelled" as const}];
  expect(calculate(agreement,sessions).expectedCents).toBe(0);
 });
 it("salary is one approved period and cannot be multiplied by group attendance",()=>{
  const fixed={...agreement,model:"fixed_period" as const,rateCents:850000,
   periodStart:"2026-11-01",periodEnd:"2026-11-30"};
  expect(calculate(fixed,[session,{...session,id:"session-2"}]).expectedCents).toBe(850000);
  expect(()=>calculateExpectedCompensation(fixed,[session],"2026-11-15","2026-11-30"))
   .toThrow("exactly its approved period");
 });
 it("never duplicates canonical sessions or participants",()=>{
  expect(()=>calculate(agreement,[session,session])).toThrow("Duplicate canonical session");
  expect(()=>calculate(agreement,[{...session,participantIds:[...pupils,pupils[0]]}]))
   .toThrow("Duplicate canonical frozen roster");
 });
 it("does not invent attendance outside a frozen roster",()=>{
  expect(()=>calculate(agreement,[{...session,attendedStudentIds:["foreign"]}]))
   .toThrow("Unrecognized pupil");
 });
 it("correctly restricts effective date/workplace and monetary boundaries",()=>{
  expect(calculate({...agreement,effectiveFrom:"2027-01-01"}).expectedCents).toBe(0);
  expect(calculate({...agreement,workplaceId:"other"}).expectedCents).toBe(0);
  expect(()=>calculate({...agreement,rateCents:-1})).toThrow("amount");
  expect(()=>calculate({...agreement,currency:"???"})).toThrow("ISO currency");
 });
});
