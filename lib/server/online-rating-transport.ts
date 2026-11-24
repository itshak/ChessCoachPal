import "server-only";
import type {RatingSnapshot} from "@/lib/chess-public-ratings";

type Provider=RatingSnapshot["provider"];
export class StudentRatingError extends Error {
 readonly status:number;
 readonly code:string;
 constructor(status:number,code:string,message:string){
  super(message);this.status=status;this.code=code;
 }
}
const fail=(status:number,code:string,message:string)=>new StudentRatingError(status,code,message);

function endpoint(provider:Provider,username:string,env:NodeJS.ProcessEnv){
 const official=provider==="lichess"?"https://lichess.org":"https://api.chess.com";
 // Fixed loopback host is only permitted for synthetic CI; never honor a
 // URL or host from the teacher, student or plugin input.
 const synthetic=env.CI==="true"&&
  env.CCP_SYNTHETIC_RATINGS_ORIGIN==="http://127.0.0.1:3995";
 const origin=synthetic?"http://127.0.0.1:3995":official;
 return origin+(provider==="lichess"?"/api/user/":"/pub/player/")+
  encodeURIComponent(username)+(provider==="lichess"?"":"/stats");
}
const maxBodyBytes=80_000;
const unavailable=()=>fail(502,"PROVIDER_UNAVAILABLE","Public rating provider unavailable");
const oversized=()=>fail(502,"PROVIDER_RESPONSE","Public rating response exceeds safe size");
const unreadable=()=>fail(502,"PROVIDER_RESPONSE","Public rating response is unreadable");

function discard(body:ReadableStream<Uint8Array>|null){
 // A rejected response must not hold up the caller while its source cancels.
 if(body)void body.cancel().catch(()=>{});
}

async function readBody(body:ReadableStream<Uint8Array>,signal:AbortSignal){
 const reader=body.getReader();
 const cancel=()=>{void reader.cancel().catch(()=>{});};
 signal.addEventListener("abort",cancel,{once:true});
 try{
  const decoder=new TextDecoder();
  let bytes=0;
  let text="";
  for(;;){
   if(signal.aborted)throw unavailable();
   const {done,value}=await reader.read();
   if(signal.aborted)throw unavailable();
   if(done)return text+decoder.decode();
   bytes+=value.byteLength;
   if(bytes>maxBodyBytes){
    cancel();
    throw oversized();
   }
   text+=decoder.decode(value,{stream:true});
  }
 }catch(error){
  if(signal.aborted)throw unavailable();
  if(error instanceof StudentRatingError)throw error;
  throw unreadable();
 }finally{
  signal.removeEventListener("abort",cancel);
  reader.releaseLock();
 }
}

export async function fetchOnlineRatingPayload(provider:Provider,username:string,
 request:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env){
 const signal=AbortSignal.timeout(10000);
 let response:Response;
 try{response=await request(endpoint(provider,username,env),{
  redirect:"error",cache:"no-store",signal,
  headers:{"Accept":"application/json"},
 });}catch{throw unavailable();}
 if(signal.aborted){
  discard(response.body);
  throw unavailable();
 }
 if(!response.ok){
  discard(response.body);
  if(response.status===429)throw fail(429,"RATE_LIMITED","Rating provider rate limit; retry later");
  if(response.status===404)throw fail(404,"ACCOUNT_NOT_FOUND","Public chess account not found");
  if(response.status===401||response.status===403)
   throw fail(403,"PROVIDER_DENIED","Public rating lookup was denied");
  throw unavailable();
 }
 const size=Number(response.headers.get("content-length")??"0");
 if(Number.isFinite(size)&&size>maxBodyBytes){
  discard(response.body);
  throw oversized();
 }
 if(!response.body)throw unreadable();
 const text=await readBody(response.body,signal);
 try{return JSON.parse(text) as unknown;}
 catch{throw unreadable();}
}
