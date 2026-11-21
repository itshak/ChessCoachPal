import { NextResponse } from "next/server";

/**
 * ADR-0019: no legacy merchant checkout is authorized while the provider-neutral
 * subscription adapter and approved offer are downstream work. Importantly,
 * checkout success does not grant plan access.
 */
export async function POST() {
  return NextResponse.json({
    code:"BILLING_NOT_CONFIGURED",
    error:"Subscription checkout is not available until a verified billing provider and offer are configured.",
  },{status:503});
}
