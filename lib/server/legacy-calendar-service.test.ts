import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {calendarSlotsList,CalendarError} from "@/lib/server/legacy-calendar-service";

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
