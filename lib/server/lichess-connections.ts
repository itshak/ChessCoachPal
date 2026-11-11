import "server-only";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {createServiceClient} from "@/lib/supabase/server";
import {encryptSecret,decryptSecret} from "@/lib/token";
import {oauthOrigin} from "@/lib/server/agent-oauth-core";

export class LichessConnectionError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(s:number,c:string,m:string)=>new LichessConnectionError(s,c,m);
type Scope="study:read"|"study:write";
type ConnectionRow={
  teacher_id:string;lichess_username:string;scopes:string[];
  token_ciphertext:string;token_sha256:string;connected_at:string;
  updated_at:string;previous_revoke_failed:boolean;
};
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const LICHESS_HANDOFF_COOKIE="ccp-lichess-pkce";

/** A loopback provider is permitted for synthetic CI, never from user input. */
export function lichessOrigin() {
  const value=process.env.LICHESS_API_ORIGIN??"https://lichess.org";
  let url:URL;
  try {url=new URL(value);} catch {throw new Error("Invalid Lichess provider configuration");}
  const secure=url.origin==="https://lichess.org";
  const synthetic=process.env.CI==="true" &&
    url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname);
  if((!secure&&!synthetic)||url.pathname!=="/"||url.search||url.hash||
     url.username||url.password) throw new Error("Invalid Lichess provider configuration");
  return url.origin;
}
function clientId(){
  const value=process.env.LICHESS_OAUTH_CLIENT_ID??"chesscoachpal-app";
  if(!/^[a-zA-Z0-9_-]{3,80}$/.test(value)) throw new Error("Invalid Lichess OAuth client configuration");
  return value;
}
function callbackUrl(){return oauthOrigin()+"/api/lichess/callback";}
function normalizedScopes(scope:string) {
  const items=Array.from(new Set(scope.split(/\s+/).filter(Boolean)));
  if(!items.includes("study:read")||
     items.some(s=>s!=="study:read"&&s!=="study:write"))
    throw failure(403,"SCOPE_DENIED","Required Lichess study permission was not granted");
  return items.sort() as Scope[];
}
function publicStatus(row:ConnectionRow|null) {
  return row?{
    connected:true,username:row.lichess_username,
    scopes:row.scopes,canPublish:row.scopes.includes("study:write"),
    connectedAt:row.connected_at,previousRevokeFailed:row.previous_revoke_failed,
  }:{
    connected:false,username:null,scopes:[] as string[],canPublish:false,
    connectedAt:null,previousRevokeFailed:false,
  };
}
async function loadRow(teacherId:string) {
  const {data,error}=await createServiceClient().from("teacher_lichess_connections")
    .select("*").eq("teacher_id",teacherId).maybeSingle();
  if(error)throw failure(500,"DATABASE_ERROR","Unable to inspect Lichess connection");
  return data as ConnectionRow|null;
}
export async function lichessConnectionStatus(teacherId:string) {
  return publicStatus(await loadRow(teacherId));
}
export function lichessConnectionHandoff(mode:"read"|"write") {
  return {
    mode,connectUrl:oauthOrigin()+"/api/lichess/connect?mode="+mode,
    explanation:"Complete provider permissions only in the signed-in browser. No provider token is available to MCP.",
  };
}
export function beginLichessAuthorization(teacherId:string,mode:"read"|"write") {
  const verifier=randomBytes(48).toString("base64url");
  const challenge=createHash("sha256").update(verifier).digest("base64url");
  const state=randomBytes(32).toString("base64url");
  const scopes:Scope[]=mode==="write"?["study:read","study:write"]:["study:read"];
  const data=encryptSecret(JSON.stringify({
    teacherId,verifier,state,scopes,issuedAt:Date.now(),
  }));
  const params=new URLSearchParams({
    response_type:"code",client_id:clientId(),redirect_uri:callbackUrl(),
    code_challenge_method:"S256",code_challenge:challenge,
    state,scope:scopes.join(" "),
  });
  return {authorizationUrl:lichessOrigin()+"/oauth?"+params.toString(),cookie:data};
}
export function authorizeLichessCallback(
  encrypted:string|undefined,teacherId:string,state:string|undefined
) {
  const plaintext=decryptSecret(encrypted??null);
  if(!plaintext||!state) throw failure(400,"INVALID_STATE","Lichess connection expired; start again");
  let parsed:unknown;
  try {parsed=JSON.parse(plaintext);} catch {throw failure(400,"INVALID_STATE","Lichess connection expired; start again");}
  const p=parsed as {teacherId?:unknown;verifier?:unknown;state?:unknown;scopes?:unknown;issuedAt?:unknown};
  if(p.teacherId!==teacherId||typeof p.verifier!=="string"||
     !/^[A-Za-z0-9._~-]{43,128}$/.test(p.verifier)||
     typeof p.state!=="string"||typeof p.issuedAt!=="number"||
     Date.now()-p.issuedAt>600000||Date.now()-p.issuedAt< -30000||
     !Array.isArray(p.scopes)||p.scopes.some(s=>s!=="study:read"&&s!=="study:write"))
    throw failure(400,"INVALID_STATE","Lichess connection expired; start again");
  const a=Buffer.from(p.state),b=Buffer.from(state);
  if(a.length!==b.length||!timingSafeEqual(a,b))
    throw failure(400,"INVALID_STATE","Lichess OAuth state mismatch");
  return {verifier:p.verifier,scopes:normalizedScopes((p.scopes as string[]).join(" "))};
}
async function fetchLichess(path:string,options:RequestInit) {
  try {
    return await fetch(lichessOrigin()+path,{
      ...options,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000),
    });
  } catch {
    throw failure(502,"PROVIDER_UNAVAILABLE","Lichess is temporarily unavailable; no changes were made");
  }
}
async function revokeRemote(ciphertext:string|null) {
  const token=decryptSecret(ciphertext);
  if(!token)return false;
  try {
    const res=await fetchLichess("/api/token",{
      method:"DELETE",headers:{Authorization:"Bearer "+token},
    });
    return res.ok||res.status===401||res.status===404;
  } catch {return false;}
}
export async function finishLichessAuthorization(
  teacherId:string,code:string,verifier:string,requestedScopes:Scope[]
) {
  if(!/^[A-Za-z0-9_]{1,2048}$/.test(code))
    throw failure(400,"INVALID_CODE","Invalid Lichess authorization response");
  const body=new URLSearchParams({
    grant_type:"authorization_code",client_id:clientId(),
    redirect_uri:callbackUrl(),code,code_verifier:verifier,
  });
  const response=await fetchLichess("/api/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:body.toString(),
  });
  if(!response.ok)
    throw failure(502,"PROVIDER_DENIED","Lichess did not grant the requested permission");
  let payload:unknown;
  try {payload=await response.json();} catch {throw failure(502,"PROVIDER_RESPONSE","Unrecognized Lichess token response");}
  const p=payload as {access_token?:unknown;scope?:unknown;token_type?:unknown};
  if(typeof p?.access_token!=="string"||!p.access_token||
     p.access_token.length>8192||typeof p.scope!=="string")
    throw failure(502,"PROVIDER_RESPONSE","Invalid Lichess permission response");
  const granted=normalizedScopes(p.scope);
  if(requestedScopes.some(s=>!granted.includes(s)))
    throw failure(403,"SCOPE_DENIED","Lichess did not grant the requested study scope");
  const token=p.access_token;
  const account=await fetchLichess("/api/account",{
    method:"GET",headers:{Authorization:"Bearer "+token},
  });
  if(!account.ok)
    throw failure(502,"PROVIDER_DENIED","Lichess account identity was not verified");
  let profile:unknown;
  try {profile=await account.json();} catch {throw failure(502,"PROVIDER_RESPONSE","Unrecognized Lichess account response");}
  const username=(profile as {username?:unknown})?.username;
  if(typeof username!=="string"||!username.trim()||username.length>100)
    throw failure(502,"PROVIDER_RESPONSE","Lichess account identity was not verified");
  const previous=await loadRow(teacherId);
  const previousRevokeFailed=!!previous&&
    previous.token_sha256!==tokenHash(token)&&
    !(await revokeRemote(previous.token_ciphertext));
  const admin=createServiceClient();
  const {error}=await admin.from("teacher_lichess_connections").upsert({
    teacher_id:teacherId,lichess_username:username.trim(),
    scopes:granted,token_ciphertext:encryptSecret(token),token_sha256:tokenHash(token),
    connected_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    previous_revoke_failed:previousRevokeFailed,
  },{onConflict:"teacher_id"});
  if(error)throw failure(500,"DATABASE_ERROR","Unable to store Lichess connection");
  const {error:auditError}=await admin.from("teacher_lichess_connection_events").insert({
    teacher_id:teacherId,action:previous?"reconnected":"connected",
    lichess_username:username,scopes:granted,
    provider_revoked:previous? !previousRevokeFailed:null,
  });
  if(auditError) throw failure(500,"DATABASE_ERROR","Lichess permission saved but audit write failed");
  return await lichessConnectionStatus(teacherId);
}
export async function disconnectLichess(teacherId:string) {
  const row=await loadRow(teacherId);
  if(!row) return {disconnected:true,providerRevoked:null,manualRevokeRequired:false};
  const providerRevoked=await revokeRemote(row.token_ciphertext);
  const admin=createServiceClient();
  const {data,error}=await admin.from("teacher_lichess_connections").delete()
    .eq("teacher_id",teacherId).eq("token_sha256",row.token_sha256)
    .select("teacher_id");
  if(error)throw failure(500,"DATABASE_ERROR","Unable to disconnect Lichess");
  if(!data?.length)
    throw failure(409,"CONFLICT","Lichess connection changed; refresh before disconnecting");
  const {error:auditError}=await admin.from("teacher_lichess_connection_events").insert({
    teacher_id:teacherId,action:"disconnected",
    lichess_username:row.lichess_username,scopes:row.scopes,
    provider_revoked:providerRevoked,
  });
  if(auditError)throw failure(500,"DATABASE_ERROR","Lichess disconnected but audit write failed");
  return {
    disconnected:true,providerRevoked,manualRevokeRequired:!providerRevoked,
    ...(!providerRevoked?{manualRevokeUrl:"https://lichess.org/account/oauth/token"}:{}),
  };
}
/** Server-only token custody for scoped study operations. Never return via MCP. */
export async function authorizedLichessToken(teacherId:string,scope:Scope) {
  const row=await loadRow(teacherId);
  if(!row)throw failure(409,"LICHESS_NOT_CONNECTED","Connect your Lichess account in the browser");
  if(!row.scopes.includes(scope))throw failure(403,"SCOPE_DENIED","Grant the required Lichess study scope in the browser");
  const token=decryptSecret(row.token_ciphertext);
  if(!token)throw failure(409,"RECONNECT_REQUIRED","Lichess permissions require reconnection");
  return {token,username:row.lichess_username};
}
