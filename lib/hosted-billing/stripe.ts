/**
 * Platform Stripe for ChessCoachPal Hosted Pro subscriptions.
 * Separate from teachers' BYO lesson-payment keys in studio_policies.
 */

import Stripe from "stripe";

export function getPlatformStripeSecret(
  env: Record<string, string | undefined> = process.env
): string | null {
  return env.HOSTED_STRIPE_SECRET_KEY?.trim() || env.STRIPE_SECRET_KEY?.trim() || null;
}

export function getPlatformStripeWebhookSecret(
  env: Record<string, string | undefined> = process.env
): string | null {
  return (
    env.HOSTED_STRIPE_WEBHOOK_SECRET?.trim() ||
    env.STRIPE_WEBHOOK_SECRET?.trim() ||
    null
  );
}

export function getProMonthlyPriceId(
  env: Record<string, string | undefined> = process.env
): string | null {
  return env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() || null;
}

export function isHostedCheckoutConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(getPlatformStripeSecret(env) && getProMonthlyPriceId(env));
}

export function createPlatformStripe(
  env: Record<string, string | undefined> = process.env
): Stripe | null {
  const key = getPlatformStripeSecret(env);
  if (!key) return null;
  return new Stripe(key);
}


/** Resolve a trusted return origin for hosted Checkout and customer portal.
 * The incoming request Host header is not an authority for a payment callback.
 * A production hosted deployment without an explicit public URL fails closed.
 */
export function hostedBillingReturnOrigin(
  env:Record<string,string|undefined>=process.env
):string|null{
  const raw=env.NEXT_PUBLIC_SITE_URL?.trim()||
    (env.VERCEL_URL?.trim()?"https://"+env.VERCEL_URL.trim():null);
  if(!raw)return env.NODE_ENV==="production"?null:"http://localhost:3000";
  try{
    const url=new URL(raw);
    if(url.username||url.password||url.search||url.hash||
       (url.pathname!=="/"&&url.pathname!==""))return null;
    if(url.protocol!=="https:" && !(
      url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname)
    ))return null;
    return url.origin;
  }catch{return null;}
}
