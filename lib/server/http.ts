import type { NextRequest } from "next/server";

/**
 * Read an env value through an alias so Next's build-time inlining of literal
 * `process.env.NEXT_PUBLIC_*` expressions does not apply: the container sets
 * NEXT_PUBLIC_SITE_URL at RUNTIME, without a rebuild. Same pattern as
 * isPushConfigured() in lib/server/push.
 */
const runtimeEnv: NodeJS.ProcessEnv = process.env;

/** The origin this deployment is published at, when it is configured. */
function configuredOrigin(): string | null {
  const raw = runtimeEnv.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    // Parsing doubles as validation, and strips any path or trailing slash.
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Absolute origin for links in outbound email and for auth redirects, honoring reverse-proxy
 * headers (Vercel and most self-host setups set x-forwarded-*).
 *
 * NEXT_PUBLIC_SITE_URL wins when set. The request is not always a trustworthy source: a
 * self-hosted stack on plain HTTP carries no scheme, and behind a proxy that does not forward
 * `Host`/`X-Forwarded-Proto` the header walk below falls through to its `https` default — which
 * is how an HTTP deployment ends up issuing https:// redirects.
 */
export function requestOrigin(req: NextRequest): string {
  const configured = configuredOrigin();
  if (configured) return configured;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}

/**
 * Strict browser cookie-POST CSRF origin. Trust only configured deployment
 * origins, never Host/X-Forwarded-Host sent by a client. The normal Next.js
 * request URL remains the local-development fallback (unlike requestOrigin,
 * which assumes HTTPS when proxy headers are missing).
 *
 * The self-hosted Coolify app sets NEXT_PUBLIC_SITE_URL at runtime. GitHub E2E
 * and standalone MCP development provide MCP_PUBLIC_ORIGIN instead.
 */
export function browserApiOrigin(req: NextRequest): string {
  const raw = runtimeEnv.NEXT_PUBLIC_SITE_URL?.trim() ||
    runtimeEnv.MCP_PUBLIC_ORIGIN?.trim();
  if (!raw) return req.nextUrl.origin;
  const site = new URL(raw);
  const localHttp = site.protocol === "http:" &&
    (site.hostname === "localhost" || site.hostname === "127.0.0.1");
  if ((site.protocol !== "https:" && !localHttp) || site.username || site.password) {
    throw new Error("Invalid configured browser API origin");
  }
  return site.origin;
}
