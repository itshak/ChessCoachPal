import { NextRequest, NextResponse } from "next/server";
import { clientById, cookieTeacher, createAuthorizationCode } from "@/lib/server/agent-oauth";
import { oauthOrigin, parseScopes, randomToken, resourceUri, validateRedirectUri } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
const escapeHtml = (v:string) => v.replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function html(content: string, status = 200) {
  return new NextResponse(content, {status,headers:{"Content-Type":"text/html; charset=utf-8",
    "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options":"nosniff"}});
}
function formParam(p: URLSearchParams | FormData, k:string) {
  const v = p.get(k);
  return typeof v === "string" ? v : "";
}
async function check(input: URLSearchParams | FormData) {
  const clientId = formParam(input, "client_id");
  const client = await clientById(clientId);
  const redirect = validateRedirectUri(formParam(input, "redirect_uri"));
  if (!client || !(client.redirect_uris as string[]).includes(redirect)) throw new Error("invalid_redirect_uri");
  if (formParam(input, "response_type") !== "code" || formParam(input,"resource") !== resourceUri() ||
    formParam(input,"code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(formParam(input,"code_challenge")) ||
    !/^[A-Za-z0-9._~-]{8,512}$/.test(formParam(input,"state")))
    throw new Error("invalid_request");
  const scopes = parseScopes(formParam(input, "scope") || "coach:read");
  return { clientId, client, redirect, scopes, challenge: formParam(input,"code_challenge"),
    state: formParam(input,"state") };
}
export async function GET(req: NextRequest) {
  try {
    const p = await check(req.nextUrl.searchParams);
    const csrf = randomToken();
    const params = ["client_id","redirect_uri","response_type","resource","code_challenge_method",
      "code_challenge","state","scope"].map(k =>
      '<input type="hidden" name="'+k+'" value="'+escapeHtml(formParam(req.nextUrl.searchParams,k))+'">').join("");
    const teacher = await cookieTeacher();
    const heading = teacher
      ? '<p>Connected teacher account. Review the request and approve only if you recognize this client.</p>'
      : '<p>You are not signed in. <a href="/login">Sign in to ChessCoachPal</a>, then return to and reload this page.</p>';
    const page = html('<!doctype html><html lang="en"><meta charset="utf-8"><title>Authorize ChessCoachPal AI connector</title>'+
      '<main style="max-width:640px;margin:3rem auto;font:16px system-ui;padding:1rem"><h1>Authorize AI connector</h1>'+
      '<p><strong>'+escapeHtml(p.client.name)+'</strong> requests access to ChessCoachPal.</p>'+
      '<p>Redirect destination: <code>'+escapeHtml(p.redirect)+'</code></p>'+
      '<p>Requested permissions: <strong>'+escapeHtml(p.scopes)+'</strong></p>'+
      '<p>Read: view students and lessons. Write: change confirmed attendance and lesson topics.</p>'+
      heading+'<form method="post" action="/oauth/authorize">'+params+
      '<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">'+
      '<button type="submit" name="decision" value="approve" '+(!teacher?'disabled':'')+'>Authorize</button> '+
      '<button type="submit" name="decision" value="deny">Deny</button></form></main></html>');
    page.cookies.set("agent_oauth_consent_csrf", csrf, {httpOnly:true,sameSite:"lax",secure:oauthOrigin().startsWith("https:"),path:"/oauth/authorize",maxAge:600});
    return page;
  } catch {
    return html("<h1>Invalid OAuth authorization request</h1>",400);
  }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== oauthOrigin() ||
      !req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") ||
      Number(req.headers.get("content-length") ?? 0) > 8192)
    return html("<h1>Forbidden</h1>",403);
  try {
    const body = new URLSearchParams(await req.text());
    const p = await check(body);
    const supplied = formParam(body, "csrf");
    const cookie = req.cookies.get("agent_oauth_consent_csrf")?.value;
    if (!cookie || supplied !== cookie) return html("<h1>Invalid consent session</h1>",403);
    if (formParam(body,"decision") === "deny") {
      const destination = new URL(p.redirect);
      destination.searchParams.set("error","access_denied");
      destination.searchParams.set("state",p.state);
      return NextResponse.redirect(destination,303);
    }
    if (formParam(body,"decision") !== "approve") return html("<h1>Invalid decision</h1>",400);
    const teacher = await cookieTeacher();
    if (!teacher) return html("<h1>Sign in first, then retry the connection</h1>",401);
    const code = await createAuthorizationCode({
      clientId:p.clientId,teacherId:teacher.teacherId,redirectUri:p.redirect,
      scopes:p.scopes,challenge:p.challenge,encryptedSession:teacher.encryptedSession,
    });
    const destination = new URL(p.redirect);
    destination.searchParams.set("code",code);
    destination.searchParams.set("state",p.state);
    const response = NextResponse.redirect(destination,303);
    response.cookies.delete("agent_oauth_consent_csrf");
    return response;
  } catch {
    return html("<h1>Could not authorize this client</h1>",400);
  }
}
