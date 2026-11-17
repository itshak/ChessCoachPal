import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Coolify SMTP secret configuration", () => {
  for (const filename of ["docker-compose.coolify.yml", "docker-compose.example.yml"]) {
    it(filename + " keeps SMTP credentials editable and Auth-only", () => {
      const compose = readFileSync(resolve(process.cwd(), filename), "utf8");
      expect(compose).toContain("GOTRUE_SMTP_PASS: " + String.fromCharCode(36) + "{AUTH_SMTP_PASS:-}");
      // A literal empty assignment on the Next.js service shadows the
      // referenced name in Coolify and marks AUTH_SMTP_PASS read-only.
      expect(compose).not.toMatch(/^\s*AUTH_SMTP_PASS\s*:/m);
    });
  }
});
