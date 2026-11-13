import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {materializeCanonicalSessions} from "./canonical-calendar-service";

vi.mock("./scheduling",()=>({
  getPolicy:vi.fn(async()=>({timezone:"UTC"})),
}));

const day="2027-01-03";
const teacher="00000000-0000-0000-0000-000000000001";
const personal="00000000-0000-0000-0000-000000000002";

function fixture(options:{
  slotCount?:number;failSlotPage?:boolean;failWorkplacePage?:boolean;
  failRpc?:boolean;endDate?:string;
}={}){
  const slots=Array.from({length:options.slotCount??501},(_,i)=>({
    id:`slot-${i}`,teacher_id:teacher,student_id:"student",
    workplace_id:personal,active:true,day_of_week:0,start_time:"16:00:00",
    start_date:day,end_date:options.endDate??day,duration_minutes:45,
    is_home_visit:false,rate_cents:null,
  }));
  const workplaces=Array.from({length:501},(_,i)=>({
    id:i===0?personal:`workplace-${i}`,timezone:"UTC",teacher_id:teacher,
  }));
  const pages:Record<string,number[]>={lesson_slots:[],workplaces:[]};
  const rpc=vi.fn(async(_name:string,_args:unknown)=>({
    data:null,error:options.failRpc?{message:"write rejected"}:null,
  }));
  const db={
    from(name:string){
      const eq:Record<string,unknown>={};
      const query={
        select(_columns:string){return query;},
        eq(column:string,value:unknown){eq[column]=value;return query;},
        order(_column:string){return query;},
        async range(start:number,end:number){
          pages[name]?.push(start);
          if(name==="lesson_slots"&&start===500&&options.failSlotPage)
            return {data:null,error:{message:"second page unavailable"}};
          if(name==="workplaces"&&start===500&&options.failWorkplacePage)
            return {data:null,error:{message:"second workplace page unavailable"}};
          const rows=name==="lesson_slots"?slots:workplaces;
          const selected=rows.filter(row=>Object.entries(eq).every(
            ([column,value])=>(row as Record<string,unknown>)[column]===value));
          return {data:selected.slice(start,end+1),error:null};
        },
      };
      return query;
    },
    rpc,
  };
  return {db:db as unknown as SupabaseClient,rpc,pages};
}

describe("canonical recurring materialization reads all pages and fails closed",()=>{
  it("reads every workplace and slot before sending occurrence transactions",async()=>{
    const {db,rpc,pages}=fixture();
    await expect(materializeCanonicalSessions(db,teacher,day,day))
      .resolves.toEqual({planned:501});
    expect(pages.workplaces).toEqual([0,500,1000]);
    expect(pages.lesson_slots).toEqual([0,500,1000]);
    expect(rpc).toHaveBeenCalledTimes(6);
    const rows=rpc.mock.calls.flatMap(call=>
      (call[1] as {p_rows:{slot_id:string}[]}).p_rows);
    expect(rows).toHaveLength(501);
    expect(new Set(rows.map(row=>row.slot_id)).size).toBe(501);
    expect(rpc.mock.calls.every(call=>call[0]==="ccp_canonical_slot_materialize"))
      .toBe(true);
  });
  it("does not write if a later slot page fails",async()=>{
    const {db,rpc}=fixture({failSlotPage:true});
    await expect(materializeCanonicalSessions(db,teacher,day,day))
      .rejects.toThrow("Unable to read recurring slots");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not write if a later workplace page fails",async()=>{
    const {db,rpc}=fixture({failWorkplacePage:true});
    await expect(materializeCanonicalSessions(db,teacher,day,day))
      .rejects.toThrow("Unable to read teacher workplaces");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects oversized plans before invoking the canonical RPC",async()=>{
    const {db,rpc}=fixture({slotCount:2501,endDate:"2027-04-01"});
    await expect(materializeCanonicalSessions(db,teacher,day,"2027-04-01"))
      .rejects.toThrow("Too many occurrences");
    expect(rpc).not.toHaveBeenCalled();
  },30000);
  it("propagates failed canonical writes without claiming success",async()=>{
    const {db,rpc}=fixture({failRpc:true});
    await expect(materializeCanonicalSessions(db,teacher,day,day))
      .rejects.toThrow("Unable to materialize canonical recurring lessons");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
