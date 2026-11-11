import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherStudentsRoster} from "@/lib/server/student-profile-service";

type Student={id:string;teacher_id:string;name:string;archived_at:string|null;name_search:string};
function dbWithRows(source:Student[],reads:Array<[number,number]>) {
 return {
   from(table:string){
     expect(table).toBe("students");
     let rows=[...source],includeCount=false;
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
       range(start:number,end:number){
         reads.push([start,end]);
         rows.sort((a,b)=>{
           for(const key of sortFields){
             const x=String((a as unknown as Record<string,unknown>)[key]);
             const y=String((b as unknown as Record<string,unknown>)[key]);
             if(x<y)return -1;if(x>y)return 1;
           }
           return 0;
         });
         // Model the hard 1000-row PostgREST cap.
         return Promise.resolve({data:rows.slice(start,Math.min(end+1,start+1000)),
           count:includeCount?rows.length:null,error:null});
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
