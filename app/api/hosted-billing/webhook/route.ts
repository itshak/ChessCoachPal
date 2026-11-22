import { NextResponse } from "next/server";

/**
 * ADR-0019: fail closed. The inherited webhook promoted hosted_plan directly
 * on a Checkout redirect and could demote a replacement subscription when an
 * older subscription.deleted event arrived. No provider-neutral adapter has
 * been approved or activated, so we must not accept/reply 200 to real webhooks.
 * HTTP 503 tells a configured provider to retry rather than silently discard
 * events; use the provider-specific verified reconciliation adapter later.
 */
export async function POST() {
  return NextResponse.json({
    code:"BILLING_PROVIDER_NOT_ACTIVE",
    error:"Verified subscription event processing is not enabled.",
  },{status:503});
}
