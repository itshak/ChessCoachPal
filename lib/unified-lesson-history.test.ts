import {describe,it,expect} from "vitest";
import {reconcileLessons,unionMinutes,type LessonTimelineItem} from "./unified-lesson-history";
const entry=(kind:"coaching"|"legacy",id:string,start:string,minutes:number,
 studentIds:string[],delivered=true):LessonTimelineItem=>({
 id,kind,startsAt:start,durationMinutes:minutes,status:delivered?"completed":"scheduled",
 studentIds,workplaceId:"wp",booked:true,delivered,
});
describe("canonical teacher minutes across two lesson models",()=>{
 it("does not count multi-student group lessons once per participant",()=>{
  const group=entry("coaching","grp","2027-04-12T13:00:00.000Z",90,["a","b","c"]);
  expect(unionMinutes([group],"booked")).toBe(90);
 });
 it("flags matching old lesson, preserves both audit rows and does not double time",()=>{
  const modern=entry("coaching","new","2027-04-12T13:00:00.000Z",90,["a","b","c"]);
  const legacy=entry("legacy","old","2027-04-12T13:00:00.000Z",90,["a"]);
  const r=reconcileLessons([modern,legacy]);
  expect(r.entries).toHaveLength(2);
  expect(r.entries[1].possibleDuplicateOf).toBe("new");
  expect(r.possibleCrossModelDuplicates).toBe(1);
  expect(r.bookedInstructorMinutes).toBe(90);
  expect(r.evidencedInstructorMinutes).toBe(90);
 });
 it("merges partial overlaps but does not misclassify distinct student lessons as exact duplicates",()=>{
  const modern=entry("coaching","new","2027-04-12T13:00:00.000Z",60,["a"]);
  const legacy=entry("legacy","old","2027-04-12T13:45:00.000Z",60,["b"]);
  const r=reconcileLessons([modern,legacy]);
  expect(r.possibleCrossModelDuplicates).toBe(0);
  expect(r.bookedInstructorMinutes).toBe(105);
 });
 it("does not present booked lessons as evidenced teaching",()=>{
  const booked=entry("coaching","n","2027-04-12T13:00:00.000Z",60,["a"],false);
  expect(reconcileLessons([booked]).bookedInstructorMinutes).toBe(60);
  expect(reconcileLessons([booked]).evidencedInstructorMinutes).toBe(0);
 });
 it("handles sequential boundaries and empty periods deterministically",()=>{
  expect(unionMinutes([],"booked")).toBe(0);
  const a=entry("legacy","a","2027-04-12T13:00:00.000Z",30,["a"]);
  const b=entry("legacy","b","2027-04-12T13:30:00.000Z",30,["b"]);
  expect(unionMinutes([a,b],"booked")).toBe(60);
 });
});
