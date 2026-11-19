import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {contactsList} from "@/lib/server/teacher-contacts-service";

describe("teacher-scoped contact roster",()=>{
  it("paginates beyond PostgREST default and redacts personal details",async()=>{
    const teacherId="00000000-0000-0000-0000-000000000001";
    const source=Array.from({length:1205},(_,i)=>({
      id:"contact-"+String(i).padStart(5,"0"),teacher_id:teacherId,
      display_name:"Contact "+String(i).padStart(5,"0"),kind:"person",
      email:"private@example.invalid",phone:"confidential",status:"active",
      revision:1,created_at:"2026-11-19",updated_at:"2026-11-19",
    }));
    const ranges:number[]=[];
    const db={
      from(table:string){
        expect(table).toBe("contacts");
        let rows=[...source];
        const query={
          select(_fields:string){return query;},
          eq(field:string,value:unknown){
            rows=rows.filter(x=>(x as Record<string,unknown>)[field]===value);return query;
          },
          order(field:string){
            rows.sort((a,b)=>String((a as Record<string,unknown>)[field])
              .localeCompare(String((b as Record<string,unknown>)[field])));
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
    const contacts=await contactsList(db,teacherId);
    expect(contacts).toHaveLength(1205);
    expect(contacts[0].id).toBe(source[0].id);
    expect(contacts[1204].id).toBe(source[1204].id);
    expect(ranges).toEqual([0,500,1000]);
    expect(contacts[0]).not.toHaveProperty("email");
    expect(contacts[0]).not.toHaveProperty("phone");
  });
});
