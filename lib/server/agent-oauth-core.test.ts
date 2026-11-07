import { describe, expect, it, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { decryptSession, digest, encryptSession, parseScopes, randomToken,
  validateRedirectUri, verifyPkce } from "./agent-oauth-core";

describe("delegated authorization security helpers",()=>{
  beforeEach(()=>{process.env.MCP_SESSION_ENCRYPTION_KEY="a".repeat(64);});
  it("accepts HTTPS and loopback only, not fragments, passwords or arbitrary HTTP",()=>{
    expect(validateRedirectUri("https://client.example/oauth/callback"))
      .toBe("https://client.example/oauth/callback");
    expect(validateRedirectUri("http://127.0.0.1:1234/callback"))
      .toBe("http://127.0.0.1:1234/callback");
    for (const uri of ["http://example.com/x","javascript:alert(1)","https://a.com/x#frag",
      "https://a:b@example.com/","https://a.com/?token=secret"]) {
      expect(()=>validateRedirectUri(uri)).toThrow();
    }
  });
  it("requires exact least-privilege scopes",()=>{
    expect(parseScopes("coach:read coach:write coach:read")).toBe("coach:read coach:write");
    expect(()=>parseScopes("coach:read admin")).toThrow();
  });
  it("validates S256 PKCE without leaking secrets",()=>{
    const verifier="a".repeat(43);
    const challenge=createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier,challenge)).toBe(true);
    expect(verifyPkce("b".repeat(43),challenge)).toBe(false);
  });
  it("encrypts teacher sessions and refuses tampering",()=>{
    const session={access_token:"x",refresh_token:"y",expires_at:5};
    const encrypted=encryptSession(session);
    expect(encrypted).not.toContain("access_token");
    expect(decryptSession(encrypted)).toEqual(session);
    const tampered=encrypted.slice(0,-2)+"zz";
    expect(()=>decryptSession(tampered)).toThrow();
  });
  it("issues random opaque tokens and stable non-reversible hashes",()=>{
    const a=randomToken(),b=randomToken();
    expect(a).not.toBe(b);
    expect(digest(a)).toBe(digest(a));
    expect(digest(a)).not.toBe(digest(b));
  });
});
