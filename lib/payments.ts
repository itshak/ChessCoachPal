/**
 * Payments provider interface (mirrors lib/email.ts).
 *
 * Provider is per-teacher (`studio_policies.payment_provider`), not a
 * platform env var. Stripe SDK is only constructed when that teacher has
 * BYO keys. Manual is the zero-config default.
 */

import { createHash } from "node:crypto";
import Stripe from "stripe";

export interface CheckoutSessionArgs {
  secretKey: string;
  invoiceId: string;
  teacherId: string;
  amountCents: number;
  currency: string;
  familyName: string;
  studioName: string;
  periodLabel: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export function createStripeClient(secretKey: string): Stripe {
  // Only the GitHub synthetic test runner can substitute this exact loopback
  // endpoint. In all production environments Stripe traffic remains HTTPS
  // to the official provider with no user-controllable host or protocol.
  const mockStripe=process.env.CI==="true"&&
    process.env.CCP_SYNTHETIC_STRIPE_ORIGIN==="http://127.0.0.1:3997";
  return new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
    ...(mockStripe?{host:"127.0.0.1",port:3997,protocol:"http" as const,maxNetworkRetries:0}:{}),
  });
}

/** Pure params builder — tested so null/blank prefill omits customer_email. */
export function buildCheckoutSessionParams(
  args: Omit<CheckoutSessionArgs, "secretKey">
): Stripe.Checkout.SessionCreateParams {
  const studio = args.studioName.trim() || "Studio";
  return {
    mode: "payment",
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    ...(args.customerEmail ? { customer_email: args.customerEmail } : {}),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: args.amountCents,
          product_data: {
            name: `Invoice - ${args.periodLabel}`,
            description: `${studio} · ${args.familyName}`,
          },
        },
      },
    ],
    metadata: {
      invoice_id: args.invoiceId,
      teacher_id: args.teacherId,
    },
  };
}

/** Stable Stripe retry key for identical teacher-owned checkout requests.
 *
 * Includes amount, currency, invoice, redirect URLs and other session
 * parameters. Never put guardian emails or provider secrets directly into
 * an idempotency key. Changed amounts receive fresh keys.
 *
 * Stripe retains idempotency responses for a limited window: callers must
 * still persist receipts and guard stale balances transactionally.
 */
export function checkoutSessionIdempotencyKey(
  args: Omit<CheckoutSessionArgs, "secretKey">
): string {
  return "ccp-checkout-v1-" + createHash("sha256")
    .update(JSON.stringify(buildCheckoutSessionParams(args)))
    .digest("hex");
}

export async function createCheckoutSession(
  args: CheckoutSessionArgs
): Promise<CheckoutSessionResult> {
  const stripe = createStripeClient(args.secretKey);
  const session = await stripe.checkout.sessions.create(
    buildCheckoutSessionParams(args),
    { idempotencyKey: checkoutSessionIdempotencyKey(args) }
  );

  if (!session.url) {
    throw new Error("Stripe Checkout Session created without a URL");
  }

  return { sessionId: session.id, url: session.url };
}

/** Deciding whether a provider link is safely retired is deliberately fail-closed. */
export function checkoutExpiryAction(status:string|null):"expire"|"safe"{
  if(status==="expired")return "safe";
  if(status==="open")return "expire";
  if(status==="complete")throw new Error("Stripe Checkout has completed; reconcile the provider payment before recording another payment");
  throw new Error("Stripe Checkout status is unknown; cannot safely retire the payment link");
}

/**
 * Expire an open Checkout Session so its link can no longer be paid (e.g.
 * after a manual payment changed what is owed). Already completed or
 * expired sessions are left alone.
 */
export async function expireCheckoutSession(
  secretKey: string,
  sessionId: string
): Promise<void> {
  const stripe = createStripeClient(secretKey);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (checkoutExpiryAction(session.status) === "expire") {
    await stripe.checkout.sessions.expire(sessionId);
  }
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
  secretKey: string
): Stripe.Event {
  const stripe = createStripeClient(secretKey);
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
