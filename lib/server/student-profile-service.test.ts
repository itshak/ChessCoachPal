import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherStudentsRoster,teacherStudentPatch} from "@/lib/server/student-profile-service";
import {studentUpdateSchema} from "@/lib/server/api-schemas";

type Student={id:string;teacher_id:string;name:string;archived_at:string|null;name_search:string};
function dbWithRows(source:Student[],reads:Array<[number,number]>) {
 return {
   from(table:string){
     expect(table).toBe("students");
     let rows=[...source],includeCount=false;
     let rangeStart=0,rangeEnd=999;
     const sortFields:Array<string>=[];
     const q={
       select(_fields:string,opts?:{count?:string}){
         includeCount=opts?.count==="exact";return q;
       },
       eq(k:string,v:unknown){
         rows=rows.filter(x=>(x as unknown as Record<string,unknown>)[k]===v);
         return q;
       },
       is(k:string,v:unknown){
         rows=rows.filter(x=>(x as unknown as Record<string,unknown>)[k]===v);
         return q;
       },
       not(k:string,_op:string,v:unknown){
         rows=rows.filter(x=>(x as unknown as Record<string,unknown>)[k]!==v);
         return q;
       },
       ilike(_key:string,pattern:string){
         const needle=pattern.replaceAll("%","").toLowerCase();
         rows=rows.filter(x=>x.name_search.toLowerCase().includes(needle));
         return q;
       },
       order(k:string){sortFields.push(k);return q;},
       // PostgREST query builders remain chainable after range(), so the
       // service can apply is/not/ilike filters before the query is awaited.
       range(start:number,end:number){
         reads.push([start,end]);rangeStart=start;rangeEnd=end;return q;
       },
       then<T>(resolve:(result:{data:Student[];count:number|null;error:null})=>T){
         const ordered=[...rows].sort((a,b)=>{
           for(const key of sortFields){
             const x=String((a as unknown as Record<string,unknown>)[key]);
             const y=String((b as unknown as Record<string,unknown>)[key]);
             if(x<y)return -1;if(x>y)return 1;
           }
           return 0;
         });
         // Model the hard 1000-row PostgREST cap after all applied filters.
         return Promise.resolve(resolve({data:ordered.slice(rangeStart,
           Math.min(rangeEnd+1,rangeStart+1000)),
           count:includeCount?ordered.length:null,error:null}));
       },
     };
     return q;
   },
 } as unknown as SupabaseClient;
}

describe("complete owner-scoped student paging",()=>{
 const teacher="00000000-0000-0000-0000-000000000001";
 const source=Array.from({length:1205},(_,i)=>({
   id:"id-"+String(i).padStart(5,"0"),teacher_id:teacher,
   name:"Learner "+String(i).padStart(5,"0"),name_search:"Learner "+i,
   archived_at:i===0?"2020-01-01T00:00:00Z":null,
 }));
 it("returns the next page at exactly 1000 records instead of hiding 205 students",async()=>{
   const reads:Array<[number,number]>=[];
   const db=dbWithRows(source,reads);
   const first=await teacherStudentsRoster(db,teacher,{
     limit:1000,offset:0,includeArchived:true,
   });
   expect(first.students).toHaveLength(1000);
   expect(first.nextOffset).toBe(1000);
   const second=await teacherStudentsRoster(db,teacher,{
     limit:1000,offset:first.nextOffset!,
     includeArchived:true,
   });
   expect(second.students).toHaveLength(205);
   expect(second.nextOffset).toBeNull();
   expect(reads).toEqual([[0,999],[1000,1999]]);
 });
 it("distinguishes active-only and explicitly archived-only filters",async()=>{
   const db=dbWithRows(source,[]);
   const active=await teacherStudentsRoster(db,teacher,{limit:1000});
   expect(active.students).toHaveLength(1000);
   expect(active.nextOffset).toBe(1000);
   expect(active.students.every(x=>x.archived_at===null)).toBe(true);
   const historical=await teacherStudentsRoster(db,teacher,{archivedOnly:true});
   expect(historical.students).toHaveLength(1);
   expect(historical.students[0].id).toBe(source[0].id);
   expect(historical.nextOffset).toBeNull();
 });
});


describe("teacher student monetary field parity",()=>{
 function fakeProfileDb(writes:Record<string,unknown>[]){
  const student={id:"student-one",teacher_id:"teacher-one",name:"Student One",
   updated_at:"2099-01-01T00:00:00Z",guardian_id:null,archived_at:null};
  return {from(table:string){
   expect(table).toBe("students");
   let patch:Record<string,unknown>|null=null;
   const q={
    select(_columns:string){return q;},
    eq(_column:string,_value:unknown){return q;},
    update(changes:Record<string,unknown>){patch=changes;writes.push(changes);return q;},
    async maybeSingle(){return {data:{...student,...(patch??{})},error:null};},
   };
   return q;
  }} as unknown as SupabaseClient;
 }
 it("rejects all malformed/negative/fractional/out-of-range website money strings",()=>{
  for(const value of ["-12","1.5","2e3","banana","Infinity","10000001"]){
   expect(studentUpdateSchema.safeParse({defaultRateCents:value}).success).toBe(false);
   expect(studentUpdateSchema.safeParse({travelFeeCents:value}).success).toBe(false);
  }
  for(const value of [-1,0.5,10_000_001,Number.POSITIVE_INFINITY])
   expect(studentUpdateSchema.safeParse({defaultRateCents:value}).success).toBe(false);
 });
 it("rejects invalid direct-service monetary values without a database write",async()=>{
  const writes:Record<string,unknown>[]=[];
  const db=fakeProfileDb(writes);
  for(const amount of ["-100","junk","2.9",3.5,10_000_001]){
   await expect(teacherStudentPatch(db,"teacher-one","student-one",{
    defaultRateCents:amount,
   })).rejects.toMatchObject({code:"VALIDATION_ERROR",status:400});
  }
  expect(writes).toHaveLength(0);
 });
 it("preserves whole-cent values and explicit clearing across website-compatible inputs",async()=>{
  const writes:Record<string,unknown>[]=[];
  const db=fakeProfileDb(writes);
  const edited=await teacherStudentPatch(db,"teacher-one","student-one",{
   defaultRateCents:"4500",travelFeeCents:"",
  });
  expect(writes).toEqual([{default_rate_cents:4500,travel_fee_cents:null}]);
  expect(edited).toMatchObject({default_rate_cents:4500,travel_fee_cents:null});
  expect(studentUpdateSchema.safeParse({defaultRateCents:"4500",travelFeeCents:""}).success)
   .toBe(true);
 });
});
