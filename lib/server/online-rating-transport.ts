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
export async function fetchOnlineRatingPayload(provider:Provider,username:string,
 request:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env){
 let response:Response;
 try{response=await request(endpoint(provider,username,env),{
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
  headers:{"Accept":"application/json"},
 });}catch{throw fail(502,"PROVIDER_UNAVAILABLE","Public rating provider unavailable");}
 if(response.status===429)throw fail(429,"RATE_LIMITED","Rating provider rate limit; retry later");
 if(response.status===404)throw fail(404,"ACCOUNT_NOT_FOUND","Public chess account not found");
 if(response.status===401||response.status===403)
  throw fail(403,"PROVIDER_DENIED","Public rating lookup was denied");
 if(!response.ok)throw fail(502,"PROVIDER_UNAVAILABLE","Public rating provider unavailable");
 const size=Number(response.headers.get("content-length")??"0");
 if(Number.isFinite(size)&&size>80000)
  throw fail(502,"PROVIDER_RESPONSE","Public rating response exceeds safe size");
 const text=await response.text();
 if(Buffer.byteLength(text,"utf8")>80000)
  throw fail(502,"PROVIDER_RESPONSE","Public rating response exceeds safe size");
 try{return JSON.parse(text) as unknown;}
 catch{throw fail(502,"PROVIDER_RESPONSE","Public rating response is unreadable");}
}
