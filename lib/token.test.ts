import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateShortToken,
  encryptSecret,
  decryptSecret,
} from "@/lib/token";

const TEST_KEY = "a".repeat(64); // 32 bytes of 0xaa

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("generateShortToken", () => {
  it("produces 22-char URL-safe tokens (128 bits)", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateShortToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it("does not collide across many generations", () => {
    const tokens = new Set(Array.from({ length: 10_000 }, generateShortToken));
    expect(tokens.size).toBe(10_000);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret with the enc.v1. prefix", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    const stored = encryptSecret("sk_test_abc123");
    expect(stored).toMatch(/^enc\.v1\./);
    expect(decryptSecret(stored)).toBe("sk_test_abc123");
  });

  it("rejects unencrypted plaintext rather than accepting legacy data", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    expect(decryptSecret("plaintext-is-not-allowed")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it("returns null instead of throwing after a key rotation", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
    const stored = encryptSecret("sk_test_abc123");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "b".repeat(64));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(decryptSecret(stored)).toBeNull();
    errSpy.mockRestore();
  });
});

