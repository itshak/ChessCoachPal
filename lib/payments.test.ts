import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams, checkoutSessionIdempotencyKey, checkoutExpiryAction } from "@/lib/payments";

const baseArgs = {
  invoiceId: "inv-1",
  teacherId: "teacher-1",
  amountCents: 500,
  currency: "USD",
  familyName: "Morales Billing Account",
  businessName: "Chess Teacher Example",
  periodLabel: "2026-08-01 – 2026-08-10",
  successUrl: "https://example.com/?payment=completed",
  cancelUrl: "https://example.com/?payment=cancelled",
};

describe("buildCheckoutSessionParams", () => {
  it("omits customer_email when no contact is approved", () => {
    const params = buildCheckoutSessionParams({...baseArgs,customerEmail:null});
    expect(params.customer_email).toBeUndefined();
    expect("customer_email" in params).toBe(false);
  });

  it("prefills only the explicitly approved payer contact", () => {
    const params = buildCheckoutSessionParams({...baseArgs,
      customerEmail:"approved-payer@example.com"});
    expect(params.customer_email).toBe("approved-payer@example.com");
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

describe("Stripe Checkout retirement guard", () => {
  it("expires only genuinely open links and accepts an already-expired link", () => {
    expect(checkoutExpiryAction("open")).toBe("expire");
    expect(checkoutExpiryAction("expired")).toBe("safe");
  });

  it("blocks double settlement for completed or ambiguous provider statuses", () => {
    expect(() => checkoutExpiryAction("complete")).toThrow(/reconcile/i);
    expect(() => checkoutExpiryAction(null)).toThrow(/unknown/i);
    expect(() => checkoutExpiryAction("unrecognized")).toThrow(/unknown/i);
  });
});
