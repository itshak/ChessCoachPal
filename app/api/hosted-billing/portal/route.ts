import { NextResponse } from "next/server";

/** ADR-0019: old teacher Stripe customer identifiers are no longer authority. */
export async function POST() {
  return NextResponse.json({
    code:"BILLING_PROVIDER_NOT_ACTIVE",
    error:"Subscription management requires an activated verified billing adapter.",
  },{status:503});
}
