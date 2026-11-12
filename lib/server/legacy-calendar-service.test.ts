import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {calendarSlotsList,calendarSlotDelete,calendarSlotUpdate,calendarSlotCreate,calendarLessonsList,calendarLessonCreate,CalendarError,canReconcileRecurringOccurrence} from "@/lib/server/legacy-calendar-service";

type Slot={id:string;teacher_id:string;student_id:string;day_of_week:number;start_time:string;active:boolean};

function fakeDb(source:Slot[],starts:number[]){
 return {
   from(table:string){
     expect(table).toBe("lesson_slots");
     let rows=[...source];
     const sortFields:string[]=[];
     const query={
       select(_fields:string){return query;},
       eq(field:string,value:unknown){
         rows=rows.filter(row=>(row as unknown as Record<string,unknown>)[field]===value);
         return query;
       },
       order(field:string){sortFields.push(field);return query;},
       range(start:number,end:number){
         starts.push(start);
         const sorted=[...rows].sort((a,b)=>{
           for(const field of sortFields){
             const l=String((a as unknown as Record<string,unknown>)[field]);
             const r=String((b as unknown as Record<string,unknown>)[field]);
             if(l<r)return -1;
             if(l>r)return 1;
           }
           return 0;
         });
         return Promise.resolve({data:sorted.slice(start,end+1),error:null});
       },
     };
     return query;
   },
 } as unknown as SupabaseClient;
}

describe("teacher recurring slot history",()=>{
 it("paginates beyond the default PostgREST limit with no duplicate or missing slots",async()=>{
   const teacherId="00000000-0000-0000-0000-000000000001";
   const studentId="00000000-0000-0000-0000-000000000002";
   const slots:Array<Slot>=Array.from({length:1205},(_,i)=>({
     id:"slot-"+String(i).padStart(5,"0"),teacher_id:teacherId,
     student_id:studentId,day_of_week:i%7,start_time:"12:00",active:true,
   }));
   // A foreign teacher must not appear even if the database has their slots.
   slots.push({...slots[0],id:"foreign-slot",teacher_id:"another-teacher"});
   const starts:number[]=[];
   const result=await calendarSlotsList(fakeDb(slots,starts),teacherId,{studentId,activeOnly:true});
   expect(result).toHaveLength(1205);
   expect(new Set(result.map(row=>row.id)).size).toBe(1205);
   expect(result.some(row=>row.id==="foreign-slot")).toBe(false);
   expect(starts).toEqual([0,500,1000]);
 });

 it("fails rather than pretending a truncated inventory is complete",async()=>{
   const teacherId="00000000-0000-0000-0000-000000000001";
   const slots=Array.from({length:20001},(_,i)=>({
     id:"slot-"+String(i).padStart(6,"0"),teacher_id:teacherId,
     student_id:"student",day_of_week:0,start_time:"12:00",active:true,
   }));
   await expect(calendarSlotsList(fakeDb(slots,[]),teacherId)).rejects.toMatchObject({
     code:"ROSTER_TOO_LARGE",status:413,
   } satisfies Partial<CalendarError>);
 });
});

type Future={id:string;slot_id:string;starts_at:string;lesson_date:string;
 duration_minutes:number;is_home_visit:boolean;rescheduled_from_date:null;attendance:[];lesson_notes:[]};
function mockedDeletionDb(items:Future[],deleted:string[],pages:number[]){
 const slot={id:"slot-one",teacher_id:"teacher-one"};
 return {from(table:string){
  const equal=new Map<string,unknown>();let since="";let deleting=false;
  const q={
   select(_s:string){return q;},
   eq(k:string,v:unknown){equal.set(k,v);return q;},
   gte(k:string,v:string){if(k==="starts_at")since=v;return q;},
   order(_k:string){return q;},
   range(a:number,b:number){
    pages.push(a);
    const rows=items.filter(x=>x.slot_id===equal.get("slot_id")&&x.starts_at>=since)
      .sort((x,y)=>x.starts_at.localeCompare(y.starts_at)||x.id.localeCompare(y.id));
    return Promise.resolve({data:rows.slice(a,b+1),error:null});
   },
   maybeSingle(){return Promise.resolve({data:slot,error:null});},
   delete(){deleting=true;return q;},
   then<T>(resolve:(v:{error:null})=>T){
    if(deleting&&table==="lessons")deleted.push(String(equal.get("id")));
    return Promise.resolve(resolve({error:null}));
   },
  };
  return q;
 }} as unknown as SupabaseClient;
}
function future(count:number):Future[]{return Array.from({length:count},(_,i)=>({
 id:"lesson-"+String(i).padStart(6,"0"),slot_id:"slot-one",
 starts_at:"2099-01-01T10:00:00.000Z",lesson_date:"2099-01-01",
 duration_minutes:30,is_home_visit:false,rescheduled_from_date:null,attendance:[],lesson_notes:[],
}));}
describe("future recurring-slot mutation safety",()=>{
 it("deletes a recurring slot with one owner-scoped SQL transaction and no separate DML",async()=>{
  const calls:Array<{name:string;input:unknown}>=[];
  const db={
    rpc(name:string,input:unknown){
      calls.push({name,input});
      return Promise.resolve({data:{ok:true,removed:1205,preserved:4},error:null});
    },
    from(){throw new Error("Recurring slot deletion must not issue a second database request");},
  } as unknown as SupabaseClient;
  const result=await calendarSlotDelete(db,"teacher-one","slot-one");
  expect(result).toEqual({ok:true,removed:1205,preserved:4});
  expect(calls).toEqual([{
    name:"ccp_calendar_slot_delete",input:{p_slot_id:"slot-one"},
  }]);
 });
 it("fails closed on database guard and ownership errors",async()=>{
  const failing=(message:string,code:string)=>({
    rpc(){return Promise.resolve({data:null,error:{message,code}});},
  }) as unknown as SupabaseClient;
  await expect(calendarSlotDelete(failing("CALENDAR_SLOT_TOO_MANY","22023"),
    "teacher-one","slot-one")).rejects.toMatchObject({
    status:413,code:"ROSTER_TOO_LARGE",
  });
  await expect(calendarSlotDelete(failing("CALENDAR_SLOT_NOT_FOUND","42501"),
    "teacher-one","foreign-slot")).rejects.toMatchObject({
    status:404,code:"NOT_FOUND",
  });
  await expect(calendarSlotDelete(failing("Unexpected error","XX000"),
    "teacher-one","slot-one")).rejects.toMatchObject({
    status:500,code:"DATABASE_ERROR",
  });
 });
 it("refuses an oversized recurring-slot update before changing the slot",async()=>{
  const deleted:string[]=[];const pages:number[]=[];
  // This mock intentionally has no slot update method. If the service writes
  // first, it throws rather than returning the expected preflight error.
  await expect(calendarSlotUpdate(
   mockedDeletionDb(future(20001),deleted,pages),"teacher-one","slot-one",
   {active:false},
  )).rejects.toMatchObject({status:413,code:"ROSTER_TOO_LARGE"});
  expect(deleted).toHaveLength(0);
  expect(pages.at(0)).toBe(0);
  expect(pages.length).toBeGreaterThan(1);
 });
 it("rejects nonsensical clock times without touching the database",async()=>{
  const noDb={} as SupabaseClient;
  await expect(calendarSlotCreate(noDb,"teacher-one",{
   studentId:"student",dayOfWeek:0,startTime:"28:99",
  })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  await expect(calendarLessonCreate(noDb,"teacher-one",{
   studentId:"student",date:"2099-01-01",time:"24:61",
  })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  await expect(calendarSlotCreate(noDb,"teacher-one",{
   studentId:"student",dayOfWeek:0,startTime:"13:00",rateCents:-100,
  })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  await expect(calendarSlotCreate(noDb,"teacher-one",{
   studentId:"student",dayOfWeek:0,startTime:"13:00",isHomeVisit:"yes" as unknown as boolean,
  })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  await expect(calendarLessonCreate(noDb,"teacher-one",{
   studentId:"student",date:"2099-01-01",time:"12:30",isHomeVisit:"yes" as unknown as boolean,
  })).rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
 });
});


describe("calendar website/MCP pagination and filter validation",()=>{
 const noDb={} as SupabaseClient;
 it("rejects malformed offsets, limits, dates and student IDs before DB access",async()=>{
  for(const options of [
   {limit:0},{limit:101},{limit:1.5},{offset:-1},{offset:100001},
   {offset:Number.NaN},{offset:2.5},{from:"not-a-date"},
   {to:"not-a-date"},{from:"2040-02-05",to:"2040-02-04"},
   {studentId:"not-uuid"},
  ]){
   await expect(calendarLessonsList(noDb,"teacher-one",options))
    .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  }
 });
});

describe("recurrence corrections never change teaching or financial evidence",()=>{
 const clean={
  attendance:[],lesson_notes:[],rescheduled_from_date:null,
  makeup_for:null,invoice_items:[],credit_redemptions:[],
 };
 it("can update only a pristine future occurrence",()=>{
  expect(canReconcileRecurringOccurrence(clean)).toBe(true);
 });
 it("preserves attended, noted, makeup, invoice-linked, redeemed or moved lessons",()=>{
  const histories=[
   {attendance:[{id:"attendance"}]},
   {lesson_notes:[{id:"notes"}]},
   {rescheduled_from_date:"2099-02-01"},
   {makeup_for:"credit-id"},
   {invoice_items:[{id:"invoice-item"}]},
   {credit_redemptions:[{id:"redemption"}]},
  ];
  for(const detail of histories){
   expect(canReconcileRecurringOccurrence({...clean,...detail})).toBe(false);
  }
 });
});
