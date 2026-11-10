import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams, checkoutSessionIdempotencyKey } from "@/lib/payments";
import { stripeCheckoutPrefillEmail } from "@/lib/guardians";

const baseArgs = {
  invoiceId: "inv-1",
  teacherId: "teacher-1",
  amountCents: 500,
  currency: "USD",
  familyName: "Morales family",
  studioName: "Chess Teacher Example",
  periodLabel: "2026-08-01 – 2026-08-10",
  successUrl: "https://example.com/portal/abc?paid=1",
  cancelUrl: "https://example.com/portal/abc",
};

describe("buildCheckoutSessionParams", () => {
  it("omits customer_email when prefill is null (both guardians)", () => {
    const family = {
      name: "Andres",
      email: "primary@example.com",
      secondary_name: "Gloria",
      secondary_email: "secondary@example.com",
      email_recipients: "both" as const,
    };
    const params = buildCheckoutSessionParams({
      ...baseArgs,
      customerEmail: stripeCheckoutPrefillEmail(family),
    });
    expect(params.customer_email).toBeUndefined();
    expect("customer_email" in params).toBe(false);
  });

  it("sets customer_email for a single recipient", () => {
    const family = {
      name: "Andres",
      email: "primary@example.com",
      secondary_name: "Gloria",
      secondary_email: "secondary@example.com",
      email_recipients: "secondary" as const,
    };
    const params = buildCheckoutSessionParams({
      ...baseArgs,
      customerEmail: stripeCheckoutPrefillEmail(family),
    });
    expect(params.customer_email).toBe("secondary@example.com");
  });
});

describe("Stripe checkout website/MCP retry keys", () => {
  it("reuses the same opaque key for identical cross-client retries", () => {
    const first = checkoutSessionIdempotencyKey(baseArgs);
    const replay = checkoutSessionIdempotencyKey({...baseArgs});
    expect(first).toBe(replay);
    expect(first).toMatch(/^ccp-checkout-v1-[a-f0-9]{64}$/);
    expect(first.length).toBeLessThan(255);
    expect(first).not.toContain(baseArgs.teacherId);
    expect(first).not.toContain(baseArgs.invoiceId);
  });

  it("does not reuse a Checkout Session after amount, URL, currency or recipient changes", () => {
    const current = checkoutSessionIdempotencyKey(baseArgs);
    expect(checkoutSessionIdempotencyKey({...baseArgs, amountCents: 501}))
      .not.toBe(current);
    expect(checkoutSessionIdempotencyKey({...baseArgs, currency: "EUR"}))
      .not.toBe(current);
    expect(checkoutSessionIdempotencyKey({...baseArgs, successUrl: "https://other.example/success"}))
      .not.toBe(current);
    expect(checkoutSessionIdempotencyKey({...baseArgs, customerEmail: "coach@example.com"}))
      .not.toBe(current);
  });

  it("does not include Stripe secret key material when called with runtime Checkout args", () => {
    const publicKey = checkoutSessionIdempotencyKey(baseArgs);
    const withSecret = checkoutSessionIdempotencyKey({...baseArgs, secretKey: "sk_test_only_synthetic"} as typeof baseArgs);
    expect(withSecret).toBe(publicKey);
    expect(withSecret).not.toContain("sk_test_only_synthetic");
  });
});
