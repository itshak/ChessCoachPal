import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requiresBetaCode } from "@/lib/entitlements";
import { shouldProvisionTeacherFromSignup, signupEmailRedirectTo } from "@/lib/onboarding";
import { requestOrigin } from "@/lib/server/http";
import { ensureTeacherForAuthUser } from "@/lib/server/ensure-teacher";
import {
  BETA_GUESS_LIMIT,
  BETA_GUESS_WINDOW_MS,
  checkRateLimit,
  clientIpFromRequest,
  hitRateLimit,
} from "@/lib/rateLimit";
import { secureCompare } from "@/lib/server/secure-compare";

/**
 * Sign-up. When `requiresBetaCode()` (NEXT_PUBLIC_BETA_ONLY or BETA_ACCESS_CODE),
 * new accounts need the server-only access code. Public GoTrue signup MUST
 * be disabled by the Auth provider: beta signup uses a service-role admin API
 * only after validating the access code. Failed guesses are rate-limited.
 * Self-hosters without the beta gate retain ordinary public Auth signup.
 *
 * Private beta currently uses auto-confirmed email signups while transactional
 * email is not configured. Admin createUser never sends a confirmation email.
 * When email verification is introduced, replace this with a tested invite /
 * confirmation flow instead of silently leaving unconfirmed accounts locked.
 */
export async function POST(req: NextRequest) {
  const { email, password, displayName, accessCode, timezone } =
    await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const betaRequired = requiresBetaCode();
  const requiredCode = process.env.BETA_ACCESS_CODE?.trim();
  const guessKey = betaRequired
    ? `beta-guess:${clientIpFromRequest(req)}`
    : null;

  if (betaRequired) {
    if (!requiredCode) {
      console.error(
        "signup: NEXT_PUBLIC_BETA_ONLY requires BETA_ACCESS_CODE on the server"
      );
      return NextResponse.json(
        { error: "Beta signup is misconfigured. Contact support." },
        { status: 503 }
      );
    }

    if (guessKey) {
      const limited = checkRateLimit(
        guessKey,
        BETA_GUESS_LIMIT,
        BETA_GUESS_WINDOW_MS
      );
      if (!limited.ok) {
        return NextResponse.json(
          {
            error: `Too many access code attempts. Try again in ${limited.retryAfterSec}s.`,
          },
          { status: 429 }
        );
      }
    }

    if (
      typeof accessCode !== "string" ||
      !secureCompare(accessCode.trim(), requiredCode)
    ) {
      if (guessKey) hitRateLimit(guessKey, BETA_GUESS_WINDOW_MS);
      return NextResponse.json(
        {
          error:
            "Invalid access code. ChessCoachPal Studio is in private beta - join the waitlist and we'll be in touch.",
        },
        { status: 403 }
      );
    }
  }

  // A public GoTrue signup endpoint bypasses a website-only invite-code gate.
  // Never use the service-role admin creation path unless GoTrue has public
  // signup disabled too. Compose maps this sentinel from the SAME DISABLE_SIGNUP
  // value as GOTRUE_DISABLE_SIGNUP; absent/mismatched config fails closed.
  if (betaRequired && process.env.BETA_GOTRUE_SIGNUP_DISABLED !== "true") {
    console.error("Beta signup refused: public GoTrue registration is not disabled");
    return NextResponse.json(
      { error: "Beta registration is temporarily unavailable." },
      { status: 503 }
    );
  }

  // Admin createUser cannot send confirmation email. Never silently bypass
  // an operator's later decision to require email verification.
  if (betaRequired && process.env.BETA_GOTRUE_EMAIL_AUTOCONFIRM !== "true") {
    console.error("Beta signup refused: verification flow is not configured");
    return NextResponse.json(
      { error: "Beta registration is temporarily unavailable." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const timezoneValue = typeof timezone === "string" ? timezone : undefined;
  const userMetadata = {
    display_name: displayName,
    ...(timezoneValue ? { timezone: timezoneValue } : {}),
  };
  const serviceClient = createServiceClient();
  let userId: string | undefined;
  if (betaRequired) {
    // Privileged Auth creation only happens AFTER the invite code was checked.
    // Admin createUser doesn't email a confirmation link. Our current private
    // beta intentionally retains auto-confirm (same as previous GoTrue config).
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) {
      // Do not reveal that an email was previously registered. Invalid
      // passwords/emails get the same generic response as existing accounts.
      return NextResponse.json(
        { error: "Unable to complete registration. Check the details and try again." },
        { status: 400 }
      );
    }
    userId = data.user?.id;
  } else {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userMetadata,
        emailRedirectTo: signupEmailRedirectTo(requestOrigin(req)),
      },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!shouldProvisionTeacherFromSignup(data.user)) {
      // Duplicate email (dummy user): do not insert a teachers row.
      return NextResponse.json({ ok: true, needsConfirmation: true });
    }
    userId = data.user?.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Sign up did not return a user" },
      { status: 500 }
    );
  }

  // Create teacher + onboarding rows before signing in. Preserve the previous
  // non-beta email-confirmation behavior on managed and open self-hosted Auth.
  const ensured = await ensureTeacherForAuthUser(serviceClient, {
    userId,
    email,
    displayName:
      typeof displayName === "string" ? displayName : email.split("@")[0],
    timezone: typeof timezone === "string" ? timezone : null,
  });
  if (!ensured.ok) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  // In local dev Supabase auto-confirms; sign in to establish the session.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return NextResponse.json({ ok: true, needsConfirmation: true });
  }

  return NextResponse.json({ ok: true });
}
