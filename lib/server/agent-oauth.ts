import "server-only";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import { createClient as createCookieClient, createServiceClient } from "@/lib/supabase/server";
import { decryptSession, digest, encryptSession, randomToken, resourceUri, type StoredTeacherSession } from "./agent-oauth-core";

const authConfig = {
  auth: { persistSession: false, autoRefreshToken: false },
};
function scopedDb(token: string) {
  return createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      ...authConfig, global: { headers: { Authorization: "Bearer " + token } },
    });
}
export async function cookieTeacher() {
  const db = await createCookieClient();
  const [{ data: { user }, error }, { data: { session } }] = await Promise.all([
    db.auth.getUser(), db.auth.getSession(),
  ]);
  if (error || !user || !session?.access_token || !session.refresh_token) return null;
  return {
    teacherId: user.id,
    encryptedSession: encryptSession({
      access_token: session.access_token, refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    }),
  };
}
export async function clientById(id: string) {
  const { data, error } = await createServiceClient().from("agent_oauth_clients")
    .select("id,name,redirect_uris").eq("id", id).maybeSingle();
  if (error) throw new Error("OAuth client lookup failed");
  return data;
}
export async function createAuthorizationCode(args: {
  clientId: string; teacherId: string; redirectUri: string;
  challenge: string; scopes: string; encryptedSession: string;
}) {
  const code = randomToken();
  const { error } = await createServiceClient().from("agent_oauth_codes").insert({
    code_hash: digest(code), client_id: args.clientId,
    teacher_id: args.teacherId, redirect_uri: args.redirectUri,
    resource: resourceUri(), challenge: args.challenge, scopes: args.scopes,
    encrypted_session: args.encryptedSession,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error("Authorization code persistence failed");
  return code;
}
export async function exchangeCode(args: {
  code: string; clientId: string; redirectUri: string; verifier: string; resource: string;
}) {
  const db = createServiceClient();
  const { data: row, error } = await db.from("agent_oauth_codes")
    .select("*").eq("code_hash", digest(args.code)).eq("client_id", args.clientId)
    .eq("redirect_uri", args.redirectUri).eq("resource", args.resource)
    .is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !row) return null;
  const { verifyPkce } = await import("./agent-oauth-core");
  if (!verifyPkce(args.verifier, row.challenge)) return null;
  const { data: consumed, error: consumeError } = await db.from("agent_oauth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", digest(args.code)).is("consumed_at", null)
    .select("code_hash").maybeSingle();
  if (consumeError || !consumed) return null;
  const access = randomToken(), refresh = randomToken();
  const { error: insertError } = await db.from("agent_oauth_grants").insert({
    client_id: row.client_id, teacher_id: row.teacher_id,
    resource: row.resource, scopes: row.scopes, encrypted_session: row.encrypted_session,
    access_hash: digest(access), refresh_hash: digest(refresh),
    access_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
  });
  if (insertError) throw new Error("OAuth grant persistence failed");
  return { access_token: access, refresh_token: refresh, token_type: "Bearer" as const,
    expires_in: 600, scope: row.scopes };
}
export async function refreshGrant(refreshToken: string, clientId: string, resource: string) {
  const db = createServiceClient();
  const hash = digest(refreshToken);
  const { data: row, error } = await db.from("agent_oauth_grants")
    .select("id,scopes").eq("refresh_hash", hash).eq("client_id", clientId)
    .eq("resource", resource).is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString()).maybeSingle();
  if (error || !row) return null;
  const access = randomToken(), refresh = randomToken();
  const { data: updated, error: updateError } = await db.from("agent_oauth_grants").update({
    access_hash: digest(access), refresh_hash: digest(refresh),
    access_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).eq("id", row.id).eq("refresh_hash", hash).is("revoked_at", null)
    .select("id").maybeSingle();
  if (updateError || !updated) return null;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer" as const,
    expires_in: 600, scope: row.scopes };
}
export async function authorizeBearer(header: string | null) {
  if (!header || !/^Bearer [A-Za-z0-9_-]{40,100}$/.test(header)) return null;
  const token = header.slice(7);
  const { data: grant, error } = await createServiceClient().from("agent_oauth_grants")
    .select("id,teacher_id,client_id,scopes,encrypted_session").eq("access_hash", digest(token))
    .eq("resource", resourceUri()).gt("access_expires_at", new Date().toISOString())
    .is("revoked_at", null).maybeSingle();
  if (error || !grant) return null;
  try {
    let session: StoredTeacherSession = decryptSession(grant.encrypted_session);
    let db = scopedDb(session.access_token);
    let verified = await db.auth.getUser(session.access_token);
    if (!verified.data.user || verified.error) {
      const ref = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authConfig);
      const { data, error: refreshError } = await ref.auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      if (refreshError || !data.session) return null;
      session = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      };
      db = scopedDb(session.access_token);
      verified = await db.auth.getUser(session.access_token);
      if (verified.error || !verified.data.user) return null;
      await createServiceClient().from("agent_oauth_grants")
        .update({ encrypted_session: encryptSession(session) })
        .eq("id", grant.id).is("revoked_at", null);
    }
    if (verified.data.user.id !== grant.teacher_id) return null;
    return { db, teacherId: grant.teacher_id as string, clientId: grant.client_id as string,
      scopes: (grant.scopes as string).split(" "), grantId: grant.id as string };
  } catch {
    return null;
  }
}
