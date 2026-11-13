import {describe,it,expect} from "vitest";
import {unionMinutes,type LessonTimelineItem} from "./unified-lesson-history";

const entry=(id:string,start:string,minutes:number,studentIds:string[],
 delivered=true):LessonTimelineItem=>({
 id,kind:"coaching",startsAt:start,durationMinutes:minutes,
 status:delivered?"completed":"scheduled",studentIds,workplaceId:"wp",
 booked:true,delivered,
});
describe("canonical instructor minutes",()=>{
 it("counts a group lesson once, independent of frozen-roster size",()=>{
  const group=entry("grp","2027-04-12T13:00:00.000Z",90,["a","b","c"]);
  expect(unionMinutes([group],"booked")).toBe(90);
 });
 it("merges overlapping canonical sessions without adding student minutes",()=>{
  const first=entry("a","2027-04-12T13:00:00.000Z",60,["a"]);
  const second=entry("b","2027-04-12T13:45:00.000Z",60,["b"]);
  expect(unionMinutes([first,second],"booked")).toBe(105);
 });
 it("does not present a booked-only session as delivered teaching",()=>{
  const booked=entry("n","2027-04-12T13:00:00.000Z",60,["a"],false);
  expect(unionMinutes([booked],"booked")).toBe(60);
  expect(unionMinutes([booked],"delivered")).toBe(0);
 });
 it("handles sequential sessions and empty periods deterministically",()=>{
  expect(unionMinutes([],"booked")).toBe(0);
  const a=entry("a","2027-04-12T13:00:00.000Z",30,["a"]);
  const b=entry("b","2027-04-12T13:30:00.000Z",30,["b"]);
  expect(unionMinutes([a,b],"booked")).toBe(60);
 });
});
