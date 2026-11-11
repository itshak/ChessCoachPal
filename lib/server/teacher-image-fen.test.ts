import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";

const mocks=vi.hoisted(()=>({getPolicy:vi.fn()}));
vi.mock("@/lib/server/scheduling",()=>({getPolicy:mocks.getPolicy}));

import {teacherImageFenPropose} from "@/lib/server/teacher-image-fen";

const noDb={} as SupabaseClient;
const fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1";
const png=Buffer.concat([
 Buffer.from([137,80,78,71,13,10,26,10]),
 Buffer.alloc(64),
]).toString("base64");
const valid={imageBase64:png,mediaType:"image/png" as const,confirmedExternal:true as const};
const response=(content:string)=>new Response(JSON.stringify({
 choices:[{message:{content}}],
}),{status:200,headers:{"Content-Type":"application/json"}});

describe("BYO image-to-FEN proposed draft security",()=>{
 beforeEach(()=>mocks.getPolicy.mockResolvedValue({
  ai_provider:"openai",ai_api_key:"synthetic-api-key-private",
 }));
 afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
 it("refuses absent user approval before even reading provider settings",async()=>{
  await expect(teacherImageFenPropose(noDb,"teacher",{
   ...valid,confirmedExternal:false as unknown as true,
  })).rejects.toMatchObject({status:400,code:"CONFIRMATION_REQUIRED"});
  expect(mocks.getPolicy).not.toHaveBeenCalled();
 });
 it("rejects oversized, false MIME, corrupt and noncanonical base64 before any fetch",async()=>{
  for(const input of [
   {...valid,mediaType:"image/jpeg" as const},
   {...valid,imageBase64:"not-base64"},
   {...valid,imageBase64:Buffer.alloc(2*1024*1024+1).toString("base64")},
   {...valid,imageBase64:png+"="},
  ]){
   await expect(teacherImageFenPropose(noDb,"teacher",input))
    .rejects.toMatchObject({status:400,code:"VALIDATION_ERROR"});
  }
  expect(mocks.getPolicy).not.toHaveBeenCalled();
 });
 it("returns only an unverified FEN review proposal; never publishes or persists",async()=>{
  const fetchMock=vi.fn(async(_url:string,request:RequestInit)=>
   response(JSON.stringify({fen,notes:"Review king positions"})));
  vi.stubGlobal("fetch",fetchMock);
  const result=await teacherImageFenPropose(noDb,"teacher",valid);
  expect(result).toMatchObject({
   proposedFen:fen,needsTeacherReview:true,
   source:"UNVERIFIED_IMAGE_AI_PROPOSAL",
  });
  expect(result.unknownGameState).toContain("castlingRights");
  expect(result.warning).toContain("Check all 64 squares");
  expect(JSON.stringify(result)).not.toContain("synthetic-api-key");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url,init]=fetchMock.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/chat/completions");
  expect((init.headers as Record<string,string>).Authorization)
   .toBe("Bearer synthetic-api-key-private");
  expect(String(init.body)).toContain("image/png;base64,");
  expect(String(init.body)).not.toContain("synthetic-api-key");
 });
 it("never fabricates a FEN for ambiguous or invalid provider suggestions",async()=>{
  for(const candidate of [
   JSON.stringify({fen:null,notes:"ambiguous"}),
   JSON.stringify({fen:"8/8/8/8/8/8/8/8 w - - 0 1"}),
  ]){
   vi.stubGlobal("fetch",vi.fn(async()=>response(candidate)));
   await expect(teacherImageFenPropose(noDb,"teacher",valid))
    .rejects.toMatchObject({status:422,code:"REVIEW_REQUIRED"});
  }
 });
 it("supports teacher-key Anthropic vision without exposing image or credentials in result",async()=>{
  mocks.getPolicy.mockResolvedValue({ai_provider:"anthropic",ai_api_key:"synthetic-anthropic-key"});
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({
   content:[{type:"text",text:JSON.stringify({fen,notes:"Review manually"})}],
  }),{status:200}));
  vi.stubGlobal("fetch",fetchMock);
  const result=await teacherImageFenPropose(noDb,"teacher",valid);
  expect(result.proposedFen).toBe(fen);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url,init]=fetchMock.mock.calls[0];
  expect(url).toBe("https://api.anthropic.com/v1/messages");
  expect((init.headers as Record<string,string>)["x-api-key"]).toBe("synthetic-anthropic-key");
  expect(String(init.body)).toContain('"type":"image"');
  expect(JSON.stringify(result)).not.toContain("synthetic-anthropic-key");
 });
 it("fails closed if teacher has no configured AI provider",async()=>{
  mocks.getPolicy.mockResolvedValue({ai_provider:"none",ai_api_key:null});
  await expect(teacherImageFenPropose(noDb,"teacher",valid))
   .rejects.toMatchObject({status:400,code:"NOT_CONFIGURED"});
 });
 it("redacts provider failures including secrets, IDs or upstream error messages",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("sk_test_private should never leak",{status:403})));
  await expect(teacherImageFenPropose(noDb,"teacher",valid))
   .rejects.toMatchObject({status:502,code:"AI_UNAVAILABLE"});
 });
});
