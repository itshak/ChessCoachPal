import {beforeEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {canonicalCalendarWindow,type CanonicalCalendarRow} from "./canonical-calendar-read";
import {compensationAgreementGet,compensationAgreementUpdate,compensationAgreementsList,
  compensationAgreementPreview} from "./compensation-agreements-service";

vi.mock("./canonical-calendar-read",()=>({canonicalCalendarWindow:vi.fn()}));
const owner="00000000-0000-4000-8000-000000000001", venue="00000000-0000-4000-8000-000000000002";
const id="00000000-0000-4000-8000-000000000003", hidden="00000000-0000-4000-8000-000000000004";
const scope="00000000-0000-4000-8000-000000000005", session="00000000-0000-4000-8000-000000000006";
const base={id,teacher_id:owner,workplace_id:venue,student_id:null,group_id:null,exact_session_id:null,
  billing_account_id:scope,agreement_role:"coach_earning",model:"per_session",rate_cents:10000,
  currency:"USD",effective_from:"2050-01-01",effective_to:null,status:"active",revision:1,
  last_request_hash:"internal-never-return",last_request_id:"internal-never-return"};
const date="2050-02-01";
const check={agreementId:id,from:date,to:date};
const occurrence={id:session,workplace_id:venue,starts_at:date+"T10:00:00.000Z",local_timezone:"UTC",
  duration_minutes:60,status:"completed",slot_occurrence_date:date,
  participants:[{studentId:scope,attendanceStatus:"present"}]} as CanonicalCalendarRow;

function stub({rows=[base],intersection=false,forecastError=false,
  frozenGroup=null,groupTerms=[],groupReadError=false}:{
  rows?:Record<string,unknown>[],intersection?:boolean,forecastError?:boolean,
  frozenGroup?:string|null,groupTerms?:Record<string,unknown>[],groupReadError?:boolean
}={}){
  const reads:{table:string;cols:string;eq:[string,unknown][];range?:number}[]=[];
  const db={from(table:string){
    const state={table,cols:"",eq:[] as [string,unknown][],range:undefined as number|undefined};
    reads.push(state);
    const response=()=>{
      if(table==="teaching_sessions")return {data:[{id:session,group_id:frozenGroup}],error:null,count:1};
      if(state.cols==="group_id,effective_from,effective_to")
        return {data:groupTerms,error:groupReadError?{message:"Group scope unavailable"}:null,count:groupTerms.length};
      if(table==="workplaces")return {data:{id:venue,timezone:"UTC"},error:null};
      if(state.cols==="exact_session_id")return {data:[],error:null,count:0};
      if(state.cols==="id")return {data:forecastError?null:intersection?[{id:hidden}]:[],
        error:forecastError?{message:"Failed scoped check"}:null};
      const matching=rows.filter(row=>state.eq.every(([k,v])=>row[k]===v));
      return {data:state.range===undefined?matching[0]??null:matching.slice(state.range,state.range+500),error:null};
    };
    return {select(cols:string){state.cols=cols;return this;},
      eq(k:string,v:unknown){state.eq.push([k,v]);return this;},
      order(){return this;},range(start:number){state.range=start;return this;},
      in(){return this;},limit(){return this;},not(){return this;},neq(){return this;},is(){return this;},lte(){return this;},or(){return this;},
      maybeSingle(){return Promise.resolve(response());},
      then(resolve:(v:unknown)=>unknown){return Promise.resolve(response()).then(resolve);}};
  }};
  return {db:db as unknown as SupabaseClient,reads};
}

beforeEach(()=>vi.mocked(canonicalCalendarWindow).mockResolvedValue([occurrence]));

it("leaves old-schema paths usable and never projects raw columns",async()=>{
  const {db,reads}=stub();
  const result=await compensationAgreementGet(db,owner,id);
  expect(result.rateCents).toBe(10000);
  expect(result).not.toHaveProperty("last_request_hash");
  expect(result).not.toHaveProperty("private_series_id");
  expect(await compensationAgreementPreview(db,owner,check)).toMatchObject({projection:{expectedCents:10000}});
  expect(reads.some(r=>r.table==="compensation_agreements"&&r.cols==="id")).toBe(false);
});
it("consumes complete raw pages while hiding protected rows and rejects direct scope operations",async()=>{
  const row={...base,id:hidden,private_series_id:scope};
  const {db,reads}=stub({rows:[...Array.from({length:500},()=>row),{...base,private_series_id:null}]});
  expect((await compensationAgreementsList(db,owner,{workplaceId:venue})).map(x=>x.id)).toEqual([id]);
  expect(reads.map(r=>r.range)).toEqual([0,500]);
  for(const action of [
    ()=>compensationAgreementGet(db,owner,hidden),
    ()=>compensationAgreementPreview(db,owner,{...check,agreementId:hidden}),
    ()=>compensationAgreementUpdate(db,owner,{id:hidden,expectedRevision:1,changes:{rateCents:123},
      idempotencyKey:scope,confirmed:true})
  ])await expect(action()).rejects.toMatchObject({status:409,code:"PRIVATE_SERIES_TERMS_UNAVAILABLE"});
  await expect(compensationAgreementGet(db,"foreign",hidden)).rejects.toMatchObject({status:404,code:"NOT_FOUND"});
});
it("refuses a potentially intersecting broad forecast on new shape, but not unrelated date/one-off or exact",async()=>{
  const health={...base,private_series_id:null};
  const {db}=stub({rows:[health],intersection:true});
  await expect(compensationAgreementPreview(db,owner,check)).rejects.toMatchObject({status:409,code:"PRIVATE_SERIES_PREVIEW_UNAVAILABLE"});
  const queryError=stub({rows:[health],forecastError:true}).db;
  await expect(compensationAgreementPreview(queryError,owner,check)).rejects.toMatchObject({status:503,code:"PRIVATE_SERIES_PREVIEW_UNAVAILABLE"});
  vi.mocked(canonicalCalendarWindow).mockResolvedValue([{...occurrence,slot_occurrence_date:null}]);
  expect(await compensationAgreementPreview(db,owner,check)).toMatchObject({projection:{expectedCents:10000}});
  vi.mocked(canonicalCalendarWindow).mockResolvedValue([occurrence]);
  const noOverlap=stub({rows:[health],intersection:false}).db;
  expect(await compensationAgreementPreview(noOverlap,owner,check)).toMatchObject({projection:{expectedCents:10000}});
  const exact=stub({rows:[{...health,exact_session_id:session}],intersection:true}).db;
  expect(await compensationAgreementPreview(exact,owner,check)).toMatchObject({projection:{expectedCents:10000}});
});


it("uses verified frozen group dates and refuses unknown or ambiguous scoped coverage",async()=>{
  const groupTerm={group_id:scope,effective_from:date,effective_to:date};
  expect(await compensationAgreementPreview(stub({frozenGroup:scope,groupTerms:[groupTerm]}).db,owner,check))
    .toMatchObject({projection:{expectedCents:0},excludedGroupSessionCount:1});
  expect(await compensationAgreementPreview(stub({frozenGroup:scope,
    groupTerms:[{...groupTerm,effective_to:"2050-01-31"}]}).db,owner,check))
    .toMatchObject({projection:{expectedCents:10000},excludedGroupSessionCount:0});
  await expect(compensationAgreementPreview(stub({frozenGroup:scope,groupTerms:[groupTerm,groupTerm]}).db,owner,check))
    .rejects.toMatchObject({status:409,code:"GROUP_AGREEMENT_REVIEW_REQUIRED"});
  await expect(compensationAgreementPreview(stub({frozenGroup:scope,groupReadError:true}).db,owner,check))
    .rejects.toMatchObject({status:503,code:"GROUP_AGREEMENT_PREVIEW_UNAVAILABLE"});
});
