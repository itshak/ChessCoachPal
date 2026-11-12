import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {materializeLessons} from "./scheduling";

const day = "2027-01-03";
function fixture(options: {badMovedSecondPage?:boolean;failInsert?:boolean}={}) {
  const slots = Array.from({length:501},(_,i)=>({
    id:`slot-${i}`,teacher_id:"teacher",student_id:"student",
    active:true,day_of_week:0,start_time:"16:00:00",
    start_date:day,end_date:day,duration_minutes:45,is_home_visit:false,
  }));
  // The skip that matters is on page TWO; reading only the default
  // PostgREST page would falsely restore a moved slot occurrence.
  const moved = [
    ...Array.from({length:500},(_,i)=>({
      teacher_id:"teacher",slot_id:`unused-${i}`,rescheduled_from_date:day,
    })),
    {teacher_id:"teacher",slot_id:"slot-500",rescheduled_from_date:day},
  ];
  const upsert=vi.fn(async(rows:unknown[])=>({
    data:null,error:options.failInsert?{message:"write rejected"}:null,
  }));
  const counts:Record<string,number[]>={lesson_slots:[],lessons:[]};
  const db={
    from(name:string) {
      const state:{eq:Record<string,unknown>;not:Set<string>}={
        eq:{},not:new Set<string>(),
      };
      const query={
        select(_cols:string){return query;},
        eq(col:string,value:unknown){state.eq[col]=value;return query;},
        not(col:string){state.not.add(col);return query;},
        order(_col:string){return query;},
        async range(start:number,end:number){
          counts[name]?.push(start);
          if(name==="lessons"&&start===500&&options.badMovedSecondPage)
            return {data:null,error:{message:"page 2 unavailable"}};
          const source=name==="lesson_slots"?slots:moved;
          const filtered=source.filter(row=>{
            for(const [k,v] of Object.entries(state.eq)){
              if((row as Record<string,unknown>)[k]!==v)return false;
            }
            for(const key of state.not){
              if((row as Record<string,unknown>)[key]===null)return false;
            }
            return true;
          });
          return {data:filtered.slice(start,end+1),error:null};
        },
        async maybeSingle(){return {data:null,error:null};},
        upsert,
      };
      return query;
    },
  };
  return {db:db as unknown as SupabaseClient,upsert,counts};
}

describe("recurring calendar materialization is complete or fails closed",()=>{
  it("pages every slot and moved-lesson row before inserting anything",async()=>{
    const {db,upsert,counts}=fixture();
    await materializeLessons(db,"teacher",day,day);
    expect(counts.lesson_slots).toEqual([0,500]);
    expect(counts.lessons).toEqual([0,500]);
    expect(upsert).toHaveBeenCalledTimes(1);
    const inserted=upsert.mock.calls[0][0] as {slot_id:string}[];
    expect(inserted).toHaveLength(500);
    expect(inserted.some(x=>x.slot_id==="slot-500")).toBe(false);
    expect(inserted.some(x=>x.slot_id==="slot-499")).toBe(true);
  });
  it("does not write if the second moved-lesson page is unavailable",async()=>{
    const {db,upsert}=fixture({badMovedSecondPage:true});
    await expect(materializeLessons(db,"teacher",day,day))
      .rejects.toThrow("Unable to load all rescheduled lessons");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("propagates write failure instead of claiming that materialization succeeded",async()=>{
    const {db,upsert}=fixture({failInsert:true});
    await expect(materializeLessons(db,"teacher",day,day))
      .rejects.toThrow("Unable to materialize lessons");
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
