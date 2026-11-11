import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {guardiansList} from "@/lib/server/teacher-guardian-service";

describe("teacher-scoped guardian roster",()=>{
  it("paginates beyond PostgREST's default result cap instead of silently hiding families",async()=>{
    const teacherId="00000000-0000-0000-0000-000000000001";
    const source=Array.from({length:1205},(_,i)=>({
      id:"family-"+String(i).padStart(5,"0"),teacher_id:teacherId,
      name:"Family "+String(i).padStart(5,"0"),students:[],
    }));
    const ranges:number[]=[];
    const db={
      from(table:string){
        expect(table).toBe("guardians");
        let rows=[...source];
        const query={
          select(_fields:string){return query;},
          eq(field:string,value:unknown){rows=rows.filter(x=>(x as Record<string,unknown>)[field]===value);return query;},
          order(field:string){
            rows.sort((a,b)=>String((a as Record<string,unknown>)[field]).localeCompare(String((b as Record<string,unknown>)[field])));
            return query;
          },
          range(start:number,end:number){
            ranges.push(start);
            return Promise.resolve({data:rows.slice(start,end+1),error:null});
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const families=await guardiansList(db,teacherId);
    expect(families).toHaveLength(1205);
    expect(families[0].id).toBe(source[0].id);
    expect(families[1204].id).toBe(source[1204].id);
    expect(ranges).toEqual([0,500,1000]);
  });
});
