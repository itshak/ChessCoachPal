import { createServiceClient } from "@/lib/supabase/server";
/**
 * Administrative OAuth connection metadata. Never include access/refresh
 * tokens, encrypted sessions, PKCE verifiers, or credential digests.
 */
export class ConnectionError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export async function teacherConnectionsList(teacherId:string){
  const {data,error}=await createServiceClient().from("agent_oauth_grants")
    .select("id,client_id,scopes,created_at,revoked_at")
    .eq("teacher_id",teacherId).is("revoked_at",null)
    .order("created_at",{ascending:false});
  if(error)throw new ConnectionError(503,"UNAVAILABLE","Connection listing unavailable");
  return {connections:data??[]};
}
/** Explicit owner-scoped, idempotent revocation; a revoked access token can
 * no longer call tools or refresh, including when revoking itself.
 */
export async function teacherConnectionRevoke(teacherId:string,id:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new ConnectionError(400,"VALIDATION_ERROR","Invalid connection ID");
  const {error}=await createServiceClient().from("agent_oauth_grants")
    .update({revoked_at:new Date().toISOString()})
    .eq("id",id).eq("teacher_id",teacherId).is("revoked_at",null);
  if(error)throw new ConnectionError(503,"UNAVAILABLE","Connection revocation unavailable");
  return {ok:true};
}
