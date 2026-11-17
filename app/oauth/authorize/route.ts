import { NextRequest, NextResponse } from "next/server";
import {getTranslations} from "next-intl/server";
import {resolveRequestLocale} from "@/i18n/server";
import {languageDirection,type AppLocale} from "@/i18n/locales";
import { clientById, cookieTeacher, createAuthorizationCode } from "@/lib/server/agent-oauth";
import { oauthOrigin, parseScopes, randomToken, resourceUri, validateRedirectUri } from "@/lib/server/agent-oauth-core";

export const dynamic = "force-dynamic";
const escapeHtml = (v:string) => v.replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function html(content: string, status = 200, locale:AppLocale="en") {
  return new NextResponse(content, {status,headers:{"Content-Type":"text/html; charset=utf-8",
    "Content-Language":locale,
    "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options":"nosniff"}});
}
function shell(title:string,body:string,locale:AppLocale){
  return '<!doctype html><html lang="'+locale+'" dir="'+languageDirection(locale)+'">'+
   '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>'+escapeHtml(title)+'</title></head><body>'+body+'</body></html>';
}
function errorPage(message:string,status:number,locale:AppLocale){
  return html(shell(message,
    '<main style="max-width:640px;margin:3rem auto;font:16px system-ui;padding:1rem"><h1>'+escapeHtml(message)+'</h1></main>',
    locale),status,locale);
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
  const locale=await resolveRequestLocale(),t=await getTranslations("oauthConsent");
  try {
    const p = await check(req.nextUrl.searchParams);
    const csrf = randomToken();
    const params = ["client_id","redirect_uri","response_type","resource","code_challenge_method",
      "code_challenge","state","scope"].map(k =>
      '<input type="hidden" name="'+k+'" value="'+escapeHtml(formParam(req.nextUrl.searchParams,k))+'">').join("");
    const teacher = await cookieTeacher();
    const heading = teacher
      ? '<p>'+escapeHtml(t("teacherConnected"))+'</p>'
      : '<p>'+escapeHtml(t("notSignedIn"))+' <a href="/login">'+
        escapeHtml(t("signIn"))+'</a>. '+escapeHtml(t("returnReload"))+'</p>';
    const consentBody='<main style="max-width:640px;margin:3rem auto;font:16px system-ui;padding:1rem;line-height:1.5">'+
      '<h1>'+escapeHtml(t("heading"))+'</h1>'+
      '<p><strong><bdi>'+escapeHtml(p.client.name)+'</bdi></strong> '+escapeHtml(t("clientRequests"))+'</p>'+
      '<p>'+escapeHtml(t("redirectDestination"))+': <code dir="ltr"><bdi>'+escapeHtml(p.redirect)+'</bdi></code></p>'+
      '<p>'+escapeHtml(t("permissions"))+': <strong dir="ltr"><bdi>'+escapeHtml(p.scopes)+'</bdi></strong></p>'+
      '<p>'+escapeHtml(t(p.scopes.split(" ").includes("coach:write")
        ?"scopeDetailsWrite":"scopeDetailsRead"))+'</p>'+
      heading+'<form method="post" action="/oauth/authorize">'+params+
      '<input type="hidden" name="csrf" value="'+escapeHtml(csrf)+'">'+
      '<button type="submit" name="decision" value="approve" '+(!teacher?'disabled':'')+'>'+escapeHtml(t("approve"))+'</button> '+
      '<button type="submit" name="decision" value="deny">'+escapeHtml(t("deny"))+'</button></form></main>';
    const page = html(shell(t("title"),consentBody,locale),200,locale);
    // OAuth consent must be allowed to redirect to the client's exact registered
    // origin. A strict self-only form-action CSP blocks cross-origin OAuth redirects
    // in Chromium even though the form initially posts to this server.
    // p.redirect has passed the exact client redirect allowlist and URL validation.
    page.headers.set("Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' " +
      new URL(p.redirect).origin + "; base-uri 'none'; frame-ancestors 'none'");
    page.cookies.set("agent_oauth_consent_csrf", csrf, {httpOnly:true,sameSite:"lax",secure:oauthOrigin().startsWith("https:"),path:"/oauth/authorize",maxAge:600});
    return page;
  } catch {
    return errorPage(t("invalidRequest"),400,locale);
  }
}
export async function POST(req: NextRequest) {
  const locale=await resolveRequestLocale(),t=await getTranslations("oauthConsent");
  if (req.headers.get("origin") !== oauthOrigin() ||
      !req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") ||
      Number(req.headers.get("content-length") ?? 0) > 8192)
    return errorPage(t("forbidden"),403,locale);
  try {
    const body = new URLSearchParams(await req.text());
    const p = await check(body);
    const supplied = formParam(body, "csrf");
    const cookie = req.cookies.get("agent_oauth_consent_csrf")?.value;
    if (!cookie || supplied !== cookie) return errorPage(t("invalidConsent"),403,locale);
    if (formParam(body,"decision") === "deny") {
      const destination = new URL(p.redirect);
      destination.searchParams.set("error","access_denied");
      destination.searchParams.set("state",p.state);
      return NextResponse.redirect(destination,303);
    }
    if (formParam(body,"decision") !== "approve") return errorPage(t("invalidDecision"),400,locale);
    const teacher = await cookieTeacher();
    if (!teacher) return errorPage(t("signInFirst"),401,locale);
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
    return errorPage(t("couldNotAuthorize"),400,locale);
  }
}
