import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getDeploymentMode } from "@/lib/entitlements";
import {
  createPlatformStripe,
  getProMonthlyPriceId,
  isHostedCheckoutConfigured,
  hostedBillingReturnOrigin,
} from "@/lib/hosted-billing/stripe";

/**
 * Create a Stripe Checkout session for ChessCoachPal Hosted Pro (platform account).
 * No-op / 503 when platform Stripe env is not configured.
 */
export async function POST() {
  if (getDeploymentMode() !== "hosted") {
    return NextResponse.json(
      { error: "Hosted billing is not enabled on this deployment" },
      { status: 400 }
    );
  }

  if (!isHostedCheckoutConfigured()) {
    return NextResponse.json(
      {
        error:
          "Online checkout isn't set up yet. Contact the operator of this ChessCoachPal installation about hosting options.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = createPlatformStripe();
  const priceId = getProMonthlyPriceId();
  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Hosted checkout is not configured" },
      { status: 503 }
    );
  }

  const service = createServiceClient();
  const { data: teacher } = await service
    .from("teachers")
    .select("id, email, stripe_customer_id, hosted_plan")
    .eq("id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  if (teacher.hosted_plan === "pro" || teacher.hosted_plan === "founding") {
    return NextResponse.json(
      { error: "You're already on an unlimited hosted plan" },
      { status: 400 }
    );
  }

  const origin=hostedBillingReturnOrigin();
  if(!origin)return NextResponse.json({
    error:"Hosted payment return URL is not safely configured",
  },{status:503});

  let customerId = teacher.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: teacher.email || user.email,
      metadata: { teacher_id: user.id },
    },{idempotencyKey:"ccp-hosted-customer-"+user.id});
    customerId = customer.id;
    const {error:saveError}=await service
      .from("teachers")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
    if(saveError)return NextResponse.json({
      error:"Unable to save hosted billing customer; no checkout was started",
    },{status:503});
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/account?hosted=success`,
    cancel_url: `${origin}/account?hosted=cancel`,
    client_reference_id: user.id,
    metadata: { teacher_id: user.id },
    subscription_data: {
      metadata: { teacher_id: user.id },
    },
  });

  if(!session.url||!session.url.startsWith("https://"))
    return NextResponse.json({error:"Checkout URL is unavailable"},{status:503});
  return NextResponse.json({ url: session.url });
}
