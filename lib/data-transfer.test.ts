import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DATA_EXPORT_VERSION, parseExportPayload, importStudioExport,
  buildStudioExport, EXPORT_PAGE_SIZE,
  type StudioDataExport,
} from "@/lib/data-transfer";

const TEACHER="00000000-0000-0000-0000-000000000002";
const DIGEST="a".repeat(64);

function payloadWithVersion(version: number): StudioDataExport {
  return {
    version,exportedAt:new Date().toISOString(),
    teacherId:"00000000-0000-0000-0000-000000000001",
    tables:{studio_policies:null,guardians:[],students:[]},
  };
}

type RpcCall={name:string;args:Record<string,unknown>};
function stubSupabase(calls:RpcCall[], failure?:string):SupabaseClient {
  return {
    rpc(name:string,args:Record<string,unknown>){
      calls.push({name,args});
      return Promise.resolve(failure
        ? {data:null,error:{message:failure}}
        : {data:{counts:{guardians:0,students:1}},error:null});
    },
  } as unknown as SupabaseClient;
}

describe("ChessCoachPal portable backup", () => {
  it("accepts only the current pre-1.0 chess-only format", () => {
    expect(DATA_EXPORT_VERSION).toBe(2);
    expect(parseExportPayload(payloadWithVersion(DATA_EXPORT_VERSION))).not.toBeNull();
    expect(parseExportPayload(payloadWithVersion(2))).toBeNull();
    expect(parseExportPayload({version:DATA_EXPORT_VERSION})).toBeNull();
  });

  it("sends all coaching records to one authenticated, atomic RPC without spoofable teacher ID",async()=>{
    const calls:RpcCall[]=[];
    const payload=payloadWithVersion(DATA_EXPORT_VERSION);
    payload.tables.students=[{id:"s1",name:"Ada",teacher_id:"old"}];
    payload.tables.workplaces=[{id:"w1",name:"Chess club",teacher_id:"old"}];
    payload.tables.teaching_sessions=[{id:"t1",title:"Endgames",teacher_id:"old"}];
    payload.tables.chess_observations=[{id:"c1",observation:"Knows opposition",teacher_id:"old"}];
    payload.tables.events=[{id:"e1",title:"Tournament",teacher_id:"old"}];
    payload.tables.event_students=[{id:"es1",event_id:"e1"}];
    payload.tables.learning_materials=[{id:"m1",kind:"game",title:"A recorded game",teacher_id:"old"}];
    payload.tables.chess_games=[{material_id:"m1",teacher_id:"old",pgn:"1. e4 *"}];
    payload.tables.training_assignments=[{id:"ha1",teacher_id:"old",material_id:"m1"}];
    payload.tables.student_training_plans=[{id:"tp1",teacher_id:"old",title:"Endgames",goals:[]}];
    payload.tables.student_training_plan_revisions=[{plan_id:"tp1",teacher_id:"old",revision:1}];
    const result=await importStudioExport(stubSupabase(calls),TEACHER,payload,DIGEST);
    expect(result).toEqual({ok:true,counts:{guardians:0,students:1}});
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("ccp_teacher_backup_restore");
    expect(calls[0].args.p_digest).toBe(DIGEST);
    expect(calls[0].args).not.toHaveProperty("teacher_id");
    const tables=calls[0].args.p_tables as StudioDataExport["tables"];
    for(const table of ["students","workplaces","teaching_sessions",
      "chess_observations","events","event_students",
      "learning_materials","chess_games","training_assignments",
      "student_training_plans","student_training_plan_revisions"]) {
      expect(tables[table]).toEqual(payload.tables[table]);
    }
  });

  it("never sends removed music tables or policy credentials to SQL",async()=>{
    const calls:RpcCall[]=[];
    const payload=payloadWithVersion(DATA_EXPORT_VERSION);
    payload.tables.plans=[{id:"malicious"}];
    payload.tables.sheet_music_assignments=[{id:"malicious"}];
    payload.tables.studio_policies={
      teacher_id:"old",timezone:"UTC",
      ai_api_key:"secret",stripe_secret_key:"secret",
      stripe_publishable_key:"secret",stripe_webhook_secret:"secret",
    };
    const result=await importStudioExport(stubSupabase(calls),TEACHER,payload,DIGEST);
    expect(result.ok).toBe(true);
    const tables=calls[0].args.p_tables as StudioDataExport["tables"];
    expect(tables.plans).toBeUndefined();
    expect(tables.sheet_music_assignments).toBeUndefined();
    expect(tables.studio_policies).toEqual({teacher_id:"old",timezone:"UTC"});
  });

  it("rejects malformed later tables before invoking the database transaction",async()=>{
    const calls:RpcCall[]=[];
    const payload=payloadWithVersion(DATA_EXPORT_VERSION);
    payload.tables.students=[{id:"must-not-be-imported",name:"Early table"}];
    payload.tables.student_training_plan_revisions=[{plan_id:"valid"},null as unknown as Record<string,unknown>];
    expect(parseExportPayload(payload)).toBeNull();
    const result=await importStudioExport(stubSupabase(calls),TEACHER,payload,DIGEST);
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("rejects non-array records and malformed policies before any SQL",async()=>{
    for(const malformed of [
      {students:{id:"incorrect-object"}},
      {payments:"not an array"},
      {studio_policies:[{id:"must-be-object"}]},
      {guardians:[[],{id:"g"}]},
    ]) {
      const calls:RpcCall[]=[];
      const payload=payloadWithVersion(DATA_EXPORT_VERSION);
      payload.tables.students=[{id:"should-not-be-written",name:"Ada"}];
      Object.assign(payload.tables,malformed);
      expect(parseExportPayload(payload)).toBeNull();
      const result=await importStudioExport(stubSupabase(calls),TEACHER,payload,DIGEST);
      expect(result.ok).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it("rejects unsupported backup versions and missing teacher before SQL",async()=>{
    const calls:RpcCall[]=[];
    expect((await importStudioExport(stubSupabase(calls),TEACHER,payloadWithVersion(99),DIGEST)).ok).toBe(false);
    expect((await importStudioExport(stubSupabase(calls),"",payloadWithVersion(DATA_EXPORT_VERSION),DIGEST)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("returns transactional failure without claiming a partial success",async()=>{
    const calls:RpcCall[]=[];
    const result=await importStudioExport(stubSupabase(calls,"violates not-null constraint"),
      TEACHER,payloadWithVersion(DATA_EXPORT_VERSION),DIGEST);
    expect(result).toEqual({ok:false,error:"violates not-null constraint"});
    expect(calls).toHaveLength(1);
  });
  it("exports more than Supabase's default 1000 rows, including dependent history",async()=>{
    const teacherId=TEACHER;
    const students=Array.from({length:1205},(_,i)=>({
      id:"student-"+String(i).padStart(5,"0"),teacher_id:teacherId,name:"Student "+i,
    }));
    const assessments=Array.from({length:1205},(_,i)=>({
      id:"assessment-"+String(i).padStart(5,"0"),student_id:students[0].id,
      rating:3,dimension_id:"dimension-1",
    }));
    const source:Record<string,Record<string,unknown>[]>={students,
      skill_assessments:assessments,teachers:[{id:teacherId,display_name:"Coach"}]};
    const ranges:Record<string,number>={};
    const db={
      from(table:string){
        let records=[...(source[table]??[])];
        const query={
          select(_columns:string){return query;},
          eq(key:string,value:unknown){
            records=records.filter(x=>x[key]===value);return query;
          },
          in(key:string,values:string[]){
            records=records.filter(x=>values.includes(String(x[key])));return query;
          },
          order(key:string){
            records.sort((a,b)=>String(a[key]??"").localeCompare(String(b[key]??"")));
            return query;
          },
          range(from:number,to:number){
            ranges[table]=(ranges[table]??0)+1;
            return Promise.resolve({data:records.slice(from,to+1),error:null});
          },
          maybeSingle(){
            return Promise.resolve({data:records[0]??null,error:null});
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;
    const backup=await buildStudioExport(db,teacherId);
    expect(EXPORT_PAGE_SIZE).toBeLessThan(1000);
    expect((backup.tables.students as unknown[])).toHaveLength(1205);
    expect((backup.tables.skill_assessments as unknown[])).toHaveLength(1205);
    expect(backup.tables).toHaveProperty("learning_materials");
    expect(backup.tables).toHaveProperty("training_assignments");
    expect(backup.tables).toHaveProperty("student_training_plans");
    expect(backup.tables).toHaveProperty("student_training_plan_revisions");
    expect(ranges.students).toBeGreaterThan(1);
    expect(ranges.skill_assessments).toBeGreaterThan(1);
  });
});
