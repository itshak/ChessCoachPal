import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DATA_EXPORT_VERSION, parseExportPayload, importStudioExport,
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
    expect(DATA_EXPORT_VERSION).toBe(1);
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
    const result=await importStudioExport(stubSupabase(calls),TEACHER,payload,DIGEST);
    expect(result).toEqual({ok:true,counts:{guardians:0,students:1}});
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("ccp_teacher_backup_restore");
    expect(calls[0].args.p_digest).toBe(DIGEST);
    expect(calls[0].args).not.toHaveProperty("teacher_id");
    const tables=calls[0].args.p_tables as StudioDataExport["tables"];
    for(const table of ["students","workplaces","teaching_sessions",
      "chess_observations","events","event_students"]) {
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
    payload.tables.payments=[{id:"valid"},null as unknown as Record<string,unknown>];
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
    expect((await importStudioExport(stubSupabase(calls),"",payloadWithVersion(1),DIGEST)).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("returns transactional failure without claiming a partial success",async()=>{
    const calls:RpcCall[]=[];
    const result=await importStudioExport(stubSupabase(calls,"violates not-null constraint"),
      TEACHER,payloadWithVersion(1),DIGEST);
    expect(result).toEqual({ok:false,error:"violates not-null constraint"});
    expect(calls).toHaveLength(1);
  });
});
