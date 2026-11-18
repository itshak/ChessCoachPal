import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { browserApiOrigin, requestOrigin } from "./http";

/**
 * requestOrigin touches only `headers` and `nextUrl`, so a stub is enough — and
 * it keeps this test inside vitest's node environment, which has no NextRequest.
 */
function stubRequest(input: {
  url?: string;
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): NextRequest {
  const url = new URL(input.url ?? "http://localhost:3000/dashboard");
  const headers = new Map<string, string>();
  if (input.host) headers.set("host", input.host);
  if (input.forwardedHost) headers.set("x-forwarded-host", input.forwardedHost);
  if (input.forwardedProto) headers.set("x-forwarded-proto", input.forwardedProto);
  return {
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    nextUrl: { origin: url.origin, protocol: url.protocol },
  } as unknown as NextRequest;
}

describe("requestOrigin", () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  const savedMcp = process.env.MCP_PUBLIC_ORIGIN;

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
    if (savedMcp === undefined) delete process.env.MCP_PUBLIC_ORIGIN;
    else process.env.MCP_PUBLIC_ORIGIN = savedMcp;
  });

  it("resolves a canonical HTTPS browser Origin behind an internal reverse-proxy URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://chesscoachpal.com";
    const request = stubRequest({
      url: "http://app:3000/api/agent/v1",
      host: "app:3000",
      forwardedHost: "untrusted-client.example",
      forwardedProto: "http",
    });
    expect(request.nextUrl.origin).toBe("http://app:3000");
    expect(requestOrigin(request)).toBe("https://chesscoachpal.com");
    expect(requestOrigin(request)).not.toBe("https://untrusted-client.example");
  });

  it("prefers the configured site URL over the request", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://chesscoachpal.example.com";
    expect(
      requestOrigin(
        stubRequest({ host: "localhost:3000", forwardedHost: "edge.internal" })
      )
    ).toBe("https://chesscoachpal.example.com");
  });

  it("normalises the configured value (trailing slash, path, query)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000/";
    expect(requestOrigin(stubRequest({ host: "localhost:3000" }))).toBe(
      "http://localhost:3000"
    );

    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/studio?a=1";
    expect(requestOrigin(stubRequest({ host: "localhost:3000" }))).toBe(
      "https://example.com"
    );
  });

  it("falls through to the headers when the configured value is junk", () => {
    // A typo in the env var must not take every redirect down with it.
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
    expect(
      requestOrigin(
        stubRequest({
          forwardedHost: "chesscoachpal.example.org",
          forwardedProto: "https",
        })
      )
    ).toBe("https://chesscoachpal.example.org");
  });

  it("honours x-forwarded-host and x-forwarded-proto when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(
      requestOrigin(
        stubRequest({
          host: "10.0.0.5:3000",
          forwardedHost: "chesscoachpal.example.org",
          forwardedProto: "https",
        })
      )
    ).toBe("https://chesscoachpal.example.org");
  });

  it("assumes https for a bare Host header — why the Docker stack sets the URL", () => {
    // Pinned, unchanged behaviour: a plain-HTTP deployment with no proxy headers
    // and no configured origin would redirect to https://. The bundled compose
    // sets NEXT_PUBLIC_SITE_URL, so that branch is not reached there.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(requestOrigin(stubRequest({ host: "localhost:3000" }))).toBe(
      "https://localhost:3000"
    );
  });

  it("falls back to the request URL when there is no host at all", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(
      requestOrigin(stubRequest({ url: "http://127.0.0.1:3000/login" }))
    ).toBe("http://127.0.0.1:3000");
  });
});

describe("browserApiOrigin", () => {
  const savedSite = process.env.NEXT_PUBLIC_SITE_URL;
  const savedMcp = process.env.MCP_PUBLIC_ORIGIN;
  afterEach(() => {
    if (savedSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedSite;
    if (savedMcp === undefined) delete process.env.MCP_PUBLIC_ORIGIN;
    else process.env.MCP_PUBLIC_ORIGIN = savedMcp;
  });
  it("trusts the canonical Coolify site origin, never internal or forwarded host", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://chesscoachpal.com/";
    process.env.MCP_PUBLIC_ORIGIN = "https://chesscoachpal.com";
    const req=stubRequest({url:"http://app:3000/api/agent/v1",
      host:"app:3000",forwardedHost:"malicious.example",forwardedProto:"http"});
    expect(browserApiOrigin(req)).toBe("https://chesscoachpal.com");
  });
  it("accepts the configured local MCP test origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.MCP_PUBLIC_ORIGIN = "http://localhost:3000";
    expect(browserApiOrigin(stubRequest({url:"http://app:3000/api/agent/v1"})))
      .toBe("http://localhost:3000");
  });
  it("falls back to the actual request URL only when no public origin is configured", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.MCP_PUBLIC_ORIGIN;
    expect(browserApiOrigin(stubRequest({url:"http://localhost:3000/api/agent/v1"})))
      .toBe("http://localhost:3000");
  });
  it("fails closed for a configured non-local plaintext origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://untrusted.example";
    expect(()=>browserApiOrigin(stubRequest({}))).toThrow("Invalid configured browser API origin");
  });
});
