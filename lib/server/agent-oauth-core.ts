import "server-only";
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export const SCOPES = ["coach:read", "coach:write"] as const;
export type CoachScope = typeof SCOPES[number];
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function validateRedirectUri(value: string): string {
  if (value.length > 2048) throw new Error("invalid_redirect_uri");
  let u: URL;
  try { u = new URL(value); } catch { throw new Error("invalid_redirect_uri"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if ((u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) ||
    u.username || u.password || u.hash || !u.hostname || u.search ||
    u.pathname.includes("..")) throw new Error("invalid_redirect_uri");
  return u.href;
}

export function parseScopes(value: string): string {
  const items = Array.from(new Set(value.trim().split(/\s+/).filter(Boolean)));
  if (!items.length || items.some(s => !SCOPES.includes(s as CoachScope)))
    throw new Error("invalid_scope");
  return items.join(" ");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqual(Buffer.from(actual), Buffer.from(challenge));
}

export interface StoredTeacherSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}
function key(): Buffer {
  const input = process.env.MCP_SESSION_ENCRYPTION_KEY ?? process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (/^[a-f0-9]{64}$/i.test(input)) return Buffer.from(input, "hex");
  if (/^[A-Za-z0-9+/]{43}=?$/.test(input)) {
    const decoded = Buffer.from(input, "base64");
    if (decoded.length === 32) return decoded;
  }
  throw new Error("MCP_SESSION_ENCRYPTION_KEY must be 32 random bytes (64 hex chars)");
}
export function encryptSession(session: StoredTeacherSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString("base64url")).join(".");
}
export function decryptSession(encoded: string): StoredTeacherSession {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Invalid session");
  const [iv, tag, cipherText] = parts.map(p => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const session = JSON.parse(Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8"));
  if (typeof session?.access_token !== "string" || typeof session?.refresh_token !== "string")
    throw new Error("Invalid session");
  return session;
}

export function oauthOrigin(): string {
  const value = process.env.MCP_PUBLIC_ORIGIN ?? "";
  if (!value) throw new Error("MCP_PUBLIC_ORIGIN is required for remote connectors");
  const url = new URL(value);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname))) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error("MCP_PUBLIC_ORIGIN must be an HTTPS origin (localhost allowed only for testing)");
  return url.origin;
}
export const resourceUri = () => oauthOrigin() + "/mcp";
