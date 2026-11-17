import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requiresBetaCode } from "@/lib/entitlements";
import { shouldProvisionTeacherFromSignup, signupEmailRedirectTo } from "@/lib/onboarding";
import { requestOrigin } from "@/lib/server/http";
import {isAppLocale} from "@/i18n/locales";
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
 * Private beta has a staged email-verification mode. When enabled, the valid
 * access code authorizes only a server-side GoTrue invitation, which sends
 * its own SMTP email. Public GoTrue signup remains disabled; the new account
 * cannot sign in until the invited email address is verified.
 */
export async function POST(req: NextRequest) {
  const { email, password, displayName, accessCode, timezone, preferredLocale } =
    await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Auth SMTP templates read a narrow, validated language tag from Auth
  // user_metadata, never an inferred name/Accept-Language guess. Reject
  // unsupported explicit choices BEFORE sending any irreversible invitation.
  if(preferredLocale!==undefined && !isAppLocale(preferredLocale))
    return NextResponse.json({error:"Unsupported interface language",code:"VALIDATION_ERROR"},{status:400});

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

  // Email verification is separately enabled only after SMTP is proven.
  // The app-side sentinel must always match GoTrue's actual auto-confirm
  // setting. Otherwise refuse new users rather than create bypassed accounts.
  const verifiedBetaSignup =
    betaRequired && process.env.BETA_EMAIL_VERIFICATION_ENABLED === "true";
  if (
    betaRequired &&
    process.env.BETA_GOTRUE_EMAIL_AUTOCONFIRM !==
      (verifiedBetaSignup ? "false" : "true")
  ) {
    console.error("Beta signup refused: email-confirmation mode mismatch");
    return NextResponse.json(
      { error: "Beta registration is temporarily unavailable." },
      { status: 503 }
    );
  }

  // Validate before sending an irreversible invitation email. Password
  // checks in GoTrue's admin update alone happen too late for SMTP sends.
  if (verifiedBetaSignup && password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters long." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const timezoneValue = typeof timezone === "string" ? timezone : undefined;
  const userMetadata = {
    display_name: displayName,
    ...(timezoneValue ? { timezone: timezoneValue } : {}),
    ...(preferredLocale ? { preferred_locale: preferredLocale } : {}),
  };
  const serviceClient = createServiceClient();
  let userId: string | undefined;
  if (betaRequired) {
    if (verifiedBetaSignup) {
      // Invitations cost SendPulse quota. Bound approved attempts as well as
      // bad access-code guesses; hash the recipient to keep PII out of keys.
      const inviteWindow = 60 * 60_000;
      const inviteKeys = [
        `beta-invite-ip:${clientIpFromRequest(req)}`,
        `beta-invite-mail:${createHash("sha256")
          .update(email.trim().toLowerCase()).digest("hex")}`,
      ];
      if (inviteKeys.some((key) => !checkRateLimit(key, 5, inviteWindow).ok)) {
        return NextResponse.json(
          { error: "Too many invitations requested. Try again later." },
          { status: 429 }
        );
      }
      for (const key of inviteKeys) hitRateLimit(key, inviteWindow);
      // GoTrue's server-side admin invitation is permitted even with public
      // signup disabled. It sends an email using auth's private SMTP settings.
      // Do not expose a direct invitation endpoint to unauthenticated users.
      const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(
        email,
        {
          data: userMetadata,
          redirectTo: `${requestOrigin(req)}/login?auth_notice=verified`,
        }
      );
      if (error || !data.user?.id) {
        return NextResponse.json(
          { error: "Unable to send verification email. Check your details and try again." },
          { status: 400 }
        );
      }
      userId = data.user.id;
      // Admin invitations create an unconfirmed, passwordless user. Set the
      // chosen password while leaving email confirmation to the email link.
      const { error: passwordError } =
        await serviceClient.auth.admin.updateUserById(userId, { password });
      if (passwordError) {
        const { error: cleanupError } =
          await serviceClient.auth.admin.deleteUser(userId);
        if (cleanupError) console.error("Beta invited-user cleanup failed");
        return NextResponse.json(
          { error: "Unable to complete registration. Contact support if this persists." },
          { status: 503 }
        );
      }
    } else {
      // Existing private-beta behavior remains available until email
      // verification is explicitly activated after real delivery testing.
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (error) {
        return NextResponse.json(
          { error: "Unable to complete registration. Check the details and try again." },
          { status: 400 }
        );
      }
      userId = data.user?.id;
    }
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
    ...(preferredLocale ? {preferredLocale} : {}),
  });
  if (!ensured.ok) {
    return NextResponse.json({ error: ensured.error }, { status: 500 });
  }

  // Do not issue a session until the verified user accepts the email invite.
  if (verifiedBetaSignup) {
    return NextResponse.json({ ok: true, needsConfirmation: true });
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
