import {describe,expect,it} from "vitest";
import {discoverHome,nextWithinVerifiedDays,verifiedHintDates,type DiscoveryRow} from "@/app/(teacher)/dashboard/home-agenda";
import {calendarDates,calendarRange,calendarView,calendarDetailHash,calendarDetailId} from "@/components/teacher/schedule/calendar-view";

const now=new Date("2026-11-27T08:00:00Z");
const row=(id:string,starts_at:string,status="scheduled",workplace_id="a"):DiscoveryRow=>({
 id,title:id,starts_at,status,workplace_id,duration_minutes:30,sessionTimeZone:"UTC",
});
const home=(rows:DiscoveryRow[]|null,zone="UTC")=>discoverHome(rows,now,zone,"2026-11-27");

describe("adaptive Home presentation using canonical discovery",()=>{
 it("shows a next lesson tomorrow without creating empty today rows",()=>{
  const result=home([row("tomorrow","2026-11-28T09:00:00Z")]);
  expect(result.days[0].rows).toEqual([]);
  expect(result.days[1].rows.map(r=>r.id)).toEqual(["tomorrow"]);
  expect(result.next?.id).toBe("tomorrow");
 });
 it.each([1,8])("prioritizes all %i scheduled lessons today, with one row per session",count=>{
  const records=Array.from({length:count},(_,i)=>({...row(String(i),"2026-11-27T"+String(9+i).padStart(2,"0")+":00:00Z"),group_id:"group"}));
  const result=home(records.reverse());
  expect(result.days[0].rows.map(r=>r.id)).toEqual(Array.from({length:count},(_,i)=>String(i)));
  expect(result.next?.id).toBe("0");
  expect(result.days.slice(1).every(day=>!day.rows.length)).toBe(true);
 });
 it("establishes next beyond seven days while excluding cancelled and completed future records",()=>{
  const result=home([
   row("far","2026-12-07T12:00:00Z"),
   row("cancelled","2026-11-27T09:00:00Z","cancelled"),
   row("future completed","2026-11-28T09:00:00Z","completed"),
  ]);
  expect(result.days.every(day=>!day.rows.length)).toBe(true);
  expect(result.next?.id).toBe("far");
 });
 it("distinguishes no future records from incomplete discovery and confirmed completion from elapsed time",()=>{
  const result=home([row("done","2026-11-25T09:00:00Z","completed"),row("past","2026-11-26T09:00:00Z")]);
  expect(result.futureComplete).toBe(true);
  expect(result.next).toBeNull();
  expect(result.completed.map(r=>r.id)).toEqual(["done"]);
  expect(result.otherPast.map(r=>r.id)).toEqual(["past"]);
  const unavailable=home(null);
  expect(unavailable.futureComplete).toBe(false);
  expect(unavailable.historyAvailable).toBe(false);
  expect(unavailable.days.every(day=>day.status==="unavailable")).toBe(true);
 });
 it("does not promote a bounded descending discovery prefix to the true next lesson",()=>{
  const full=Array.from({length:100},(_,i)=>row(String(i),"2026-12-07T12:00:00Z"));
  const result=home(full);
  expect(result.next).toBeNull();
  expect(result.futureComplete).toBe(false);
  expect(result.historyPartial).toBe(true);
  full[99]=row("prior","2026-11-26T12:00:00Z");
  expect(home(full).futureComplete).toBe(true);
 });
 it("uses actual instant, fractional-second order, and context civil date across workplaces",()=>{
  const result=home([
   row("a-later","2026-11-27T23:30:00.123456Z","scheduled","b"),
   row("z-earlier","2026-11-27T23:30:00.123123Z"),
  ],"Asia/Jerusalem");
  expect(result.days[0].rows).toEqual([]);
  expect(result.days[1].rows.map(r=>r.id)).toEqual(["z-earlier","a-later"]);
  expect(result.next?.id).toBe("z-earlier");
 });
 it("does not skip an unavailable prior day or treat a date hint as a scheduled lesson",()=>{
  const known=row("known","2026-12-07T12:00:00Z");
  expect(verifiedHintDates([known,known],"UTC","2026-11-27")).toEqual(["2026-12-07"]);
  expect(nextWithinVerifiedDays([{date:"2026-11-27",status:"unavailable",rows:[]},{date:"2026-12-07",status:"ready",rows:[known]}])).toBeNull();
  expect(nextWithinVerifiedDays([{date:"2026-11-27",status:"ready",rows:[]},{date:"2026-12-07",status:"ready",rows:[known],nextAfter:"cursor"}])?.id).toBe("known");
 });
});

describe("calendar civil date navigation",()=>{
 it("uses the same week range for mobile agenda and desktop default",()=>{
  expect(calendarRange("2026-11-27","auto")).toEqual(calendarRange("2026-11-27","agenda"));
  expect(calendarRange("2026-11-27","week")).toEqual({start:"2026-11-22",end:"2026-11-28",previous:"2026-11-15",next:"2026-11-29"});
 });
 it("uses whole weeks for a month including cross-month dates",()=>{
  const range=calendarRange("2026-11-27","month");
  expect(range).toEqual({start:"2026-11-01",end:"2026-12-05",previous:"2026-10-01",next:"2026-12-01"});
  expect(calendarDates(range.start,range.end)).toHaveLength(35);
 });
 it("supports leap-day and DST date navigation without using 24-hour local increments",()=>{
  expect(calendarRange("2028-02-29","day")).toEqual({start:"2028-02-29",end:"2028-02-29",previous:"2028-02-28",next:"2028-03-01"});
  expect(calendarRange("2027-03-14","day").next).toBe("2027-03-15");
  expect(calendarView("invalid")).toBe("auto");
 });
});

describe("calendar detail navigation identity",()=>{
 it("round-trips only an exact UUID and does not capture existing attendance anchors",()=>{
  const id="e715567e-927b-4d01-b6d1-343417b108b1";
  expect(calendarDetailId(calendarDetailHash(id))).toBe(id);
  for(const hash of ["","#lesson-attendance-"+id,"#calendar-detail-invalid","#calendar-detail-"+id+"/notes"])
   expect(calendarDetailId(hash)).toBeNull();
 });
});
