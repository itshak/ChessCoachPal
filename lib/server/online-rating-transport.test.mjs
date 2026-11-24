import test from "node:test";
import assert from "node:assert/strict";
import {registerHooks} from "node:module";

// Resolve Next's compile-time marker only inside this native Node test process.
const hooks=registerHooks({resolve(specifier,context,next){
 return specifier==="server-only"?
  {shortCircuit:true,url:"data:text/javascript,export%20%7B%7D"}:next(specifier,context);
}});
const {fetchOnlineRatingPayload,StudentRatingError}=await import("./online-rating-transport.ts");
hooks.deregister();
const {parseLichessPerfs,parseChesscomStats}=await import("../chess-public-ratings.ts");
const call=(response,env={})=>fetchOnlineRatingPayload("lichess","synthetic",async()=>response,env);
const error=(status,code)=>e=>e instanceof StudentRatingError&&e.status===status&&e.code===code;

test("normal builds use fixed provider endpoints; only exact CI loopback can replace the host",async()=>{
 const seen=[];
 const fetch=async (url,opts)=>{
  seen.push(url);
  assert.equal(opts.redirect,"error");
  assert.equal(opts.cache,"no-store");
  assert.deepEqual(opts.headers,{Accept:"application/json"});
  assert.ok(opts.signal instanceof AbortSignal);
  assert.equal(opts.signal.aborted,false);
  return Response.json({synthetic:true});
 };
 const configured="http://127.0.0.1:3995";
 for(const [provider,name,env] of [
  ["lichess","a/b?c#d",{}],
  ["chesscom","Synthetic_1",{CI:"false",CCP_SYNTHETIC_RATINGS_ORIGIN:configured}],
  ["lichess","Synthetic_2",{CI:"true",CCP_SYNTHETIC_RATINGS_ORIGIN:"https://fixture.invalid"}],
  ["lichess","Synthetic_3",{CI:"true",CCP_SYNTHETIC_RATINGS_ORIGIN:configured}],
  ["chesscom","Synthetic_4",{CI:"true",CCP_SYNTHETIC_RATINGS_ORIGIN:configured}],
 ])assert.deepEqual(await fetchOnlineRatingPayload(provider,name,fetch,env),{synthetic:true});
 assert.deepEqual(seen,[
  "https://lichess.org/api/user/a%2Fb%3Fc%23d",
  "https://api.chess.com/pub/player/Synthetic_1/stats",
  "https://lichess.org/api/user/Synthetic_2",
  "http://127.0.0.1:3995/api/user/Synthetic_3",
  "http://127.0.0.1:3995/pub/player/Synthetic_4/stats",
 ]);
});

test("status codes, refused redirects and fetch failure (including timeout) stay typed",async()=>{
 for(const [input,status,code] of [
  [429,429,"RATE_LIMITED"],[404,404,"ACCOUNT_NOT_FOUND"],
  [401,403,"PROVIDER_DENIED"],[403,403,"PROVIDER_DENIED"],
  [503,502,"PROVIDER_UNAVAILABLE"],[302,502,"PROVIDER_UNAVAILABLE"],
 ])await assert.rejects(call(new Response(null,{status:input})),error(status,code));
 for(const e of [new DOMException("Timed out","TimeoutError"),new TypeError("Redirect refused")]){
  await assert.rejects(fetchOnlineRatingPayload("chesscom","synthetic",async()=>{throw e;},{}),
   error(502,"PROVIDER_UNAVAILABLE"));
 }
});

test("declared and consumed byte limits, unreadable JSON, and absent categories remain distinct",async()=>{
 const bad=error(502,"PROVIDER_RESPONSE");
 await assert.rejects(call(new Response(null,{headers:{"content-length":"80001"}})),bad);
 await assert.rejects(call(new Response("é".repeat(40001))),bad);
 await assert.rejects(call(new Response("{broken")),bad);
 const observedAt="2026-01-02T00:00:00.000Z";
 const unknown=await call(Response.json({}));
 assert.deepEqual(parseLichessPerfs(await call(Response.json({perfs:{}})),observedAt),[]);
 assert.deepEqual(parseChesscomStats(unknown,observedAt),[]);
 const l=await call(Response.json({perfs:{rapid:{rating:1813,rd:43,prov:false,games:10}}}));
 const c=await call(Response.json({chess_rapid:{last:{rating:1747,date:1767312000},record:{win:2,loss:1,draw:1}}}));
 assert.deepEqual(parseLichessPerfs(l,observedAt).map(row=>[row.provider,row.timeControl,row.rating,row.games]),[["lichess","rapid",1813,10]]);
 assert.deepEqual(parseChesscomStats(c,observedAt).map(row=>[row.provider,row.timeControl,row.rating,row.games]),[["chesscom","rapid",1747,4]]);
});

test("missing and false short lengths cannot bypass the byte cap; cancellation never blocks",async()=>{
 for(const headers of [{},{"content-length":"7"},{"content-length":"80001"}]){
  let reads=0;
  let cancels=0;
  const stream=new ReadableStream({
   pull(controller){
    ++reads;
    controller.enqueue(new Uint8Array(40001));
   },
   cancel(){
    ++cancels;
    return new Promise(()=>{});
   },
  },{highWaterMark:0});
  await assert.rejects(call(new Response(stream,{headers})),e=>
   error(502,"PROVIDER_RESPONSE")(e)&&/safe size/.test(e.message));
  assert.equal(reads,headers["content-length"]==="80001"?0:2);
  assert.equal(cancels,1);
 }
});

test("accepts exactly 80,000 raw bytes and incrementally decodes split UTF-8",async()=>{
 const text='"'+"é".repeat(39999)+'"';
 const bytes=new TextEncoder().encode(text);
 assert.equal(bytes.length,80000);
 const stream=new ReadableStream({start(controller){
  for(const [from,to] of [[0,2],[2,50000],[50000,80000]])controller.enqueue(bytes.subarray(from,to));
  controller.close();
 }});
 assert.equal(await call(new Response(stream,{headers:{"content-length":"1"}})),JSON.parse(text));
 const padding=new Uint8Array(80001).fill(32);
 padding.set(new TextEncoder().encode("{}"));
 await assert.rejects(call(new Response(padding)),error(502,"PROVIDER_RESPONSE"));
});

test("missing, errored and truncated bodies stay typed",async()=>{
 const bad=error(502,"PROVIDER_RESPONSE");
 await assert.rejects(call(new Response(null)),bad);
 await assert.rejects(call(new Response("{")),bad);
 const broken=new ReadableStream({pull(controller){controller.error(new Error("synthetic body read failure"));}});
 await assert.rejects(call(new Response(broken)),bad);
});

test("the fetch deadline also cancels stalled body reads without waiting on cancellation",async t=>{
 const deadline=new AbortController();
 const timeout=t.mock.method(AbortSignal,"timeout",()=>deadline.signal);
 let cancels=0;
 let calls=0;
 const stream=new ReadableStream({
  pull(){deadline.abort(new DOMException("synthetic timeout","TimeoutError"));},
  cancel(){++cancels;return new Promise(()=>{});},
 },{highWaterMark:0});
 await assert.rejects(fetchOnlineRatingPayload("lichess","synthetic",async (_url,{signal})=>{
  ++calls;
  assert.equal(signal,deadline.signal);
  return new Response(stream);
 },{}),error(502,"PROVIDER_UNAVAILABLE"));
 assert.equal(calls,1);
 assert.equal(cancels,1);
 assert.equal(timeout.mock.callCount(),1);
 assert.deepEqual(timeout.mock.calls[0].arguments,[10000]);
});
