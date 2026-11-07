import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Generate a URL-safe family or calendar access token.
 * 16 random bytes (128 bits) produce a 22-character base64url token. Store
 * it in the database and rotate it to revoke shared links.
 */
export function generateShortToken(): string {
  return randomBytes(16).toString("base64url");
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"
    );
  }
  return Buffer.from(hex, "hex");
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

/**
 * At-rest encryption for per-teacher secrets (BYO Stripe and AI API keys)
 * stored in studio_policies. Only authenticated encrypted values are accepted;
 * pre-1.0 plaintext compatibility is intentionally unsupported.
 */
const SECRET_PREFIX = "enc.v1.";

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return SECRET_PREFIX + base64urlEncode(Buffer.concat([iv, authTag, encrypted]));
}

/**
 * Decrypt a stored secret. Unknown/unprefixed values are rejected. Returns
 * null when decryption fails (e.g. a rotated TOKEN_ENCRYPTION_KEY).
 */
export function decryptSecret(stored: string | null): string | null {
  if (!stored || !stored.startsWith(SECRET_PREFIX)) return null;
  try {
    const raw = base64urlDecode(stored.slice(SECRET_PREFIX.length));
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("Failed to decrypt stored secret (key rotated?):", err);
    return null;
  }
}

