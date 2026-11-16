"use client";

import { useEffect, useState } from "react";
import {useTranslations} from "next-intl";
import {LanguageSwitcher} from "@/components/locale/LanguageSwitcher";
import { useRouter } from "next/navigation";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  authFormErrorFromUnknown,
  shouldShowLocalDevAuthHints,
  type AuthFormError,
  withTimeout,
} from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Mode = "signin" | "signup" | "waitlist" | "forgot";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export function LoginForm({
  betaRequired,
  showLegalLinks = false,
  isHosted = false,
}: {
  betaRequired: boolean;
  showLegalLinks?: boolean;
  isHosted?: boolean;
}) {
  const router = useRouter();
  const t=useTranslations("login");
  useEffect(() => {
    document.title = "ChessCoachPal - Login";
  }, []);
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get("message");
    if (message) {
      setError({ headline: message });
      window.history.replaceState(null, "", "/login");
    }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<AuthFormError | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    if (next === "waitlist" && !betaRequired) {
      setMode("signup");
      return;
    }
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "waitlist") {
        const res = await withTimeout(
          fetch("/api/auth/waitlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }),
          AUTH_REQUEST_TIMEOUT_MS
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("somethingWrong"));
        setInfo(t("submitWaitlist"));
        return;
      }

      if (mode === "forgot") {
        const supabase = createClient();
        await withTimeout(
          supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
          }),
          AUTH_REQUEST_TIMEOUT_MS
        );
        setInfo(
          t("resetSent")
        );
        return;
      }

      if (mode === "signup") {
        const res = await withTimeout(
          fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password,
              displayName: displayName || email.split("@")[0],
              accessCode: betaRequired ? accessCode : undefined,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          }),
          AUTH_REQUEST_TIMEOUT_MS
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("somethingWrong"));
        if (data.needsConfirmation) {
          setInfo(
            t("checkEmail")
          );
          return;
        }
      } else {
        const supabase = createClient();
        const { error: signInError } = await withTimeout(
          supabase.auth.signInWithPassword({
            email,
            password,
          }),
          AUTH_REQUEST_TIMEOUT_MS
        );
        if (signInError) throw signInError;

        await withTimeout(
          fetch("/api/auth/setup-teacher", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              displayName: email.split("@")[0],
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          }),
          AUTH_REQUEST_TIMEOUT_MS
        ).catch(() => {
          // Sign-in already succeeded; missing profile setup is repaired later.
        });
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError(
        authFormErrorFromUnknown(err, {
          isLocal: shouldShowLocalDevAuthHints({
            hostname: window.location.hostname,
            isHosted,
          }),
          action: mode,
        })
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="mb-4"><LanguageSwitcher compact /></div>
      <Card padding="lg" className="max-w-sm w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary">ChessCoachPal</h1>
          <p className="text-muted text-sm mt-1">
            {mode === "signin" && t("signinSubtitle")}
            {mode === "signup" && t("signupSubtitle")}
            {mode === "waitlist" && t("waitlistSubtitle")}
            {mode === "forgot" && t("forgotSubtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <input
              type="text"
              placeholder={t("name")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              required
            />
          )}
          <input
            type="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
          />
          {mode !== "waitlist" && mode !== "forgot" && (
            <input
              type="password"
              placeholder={t("password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              minLength={6}
            />
          )}
          {mode === "signin" && (
            <p className="text-xs text-end -mt-2">
              <button
                type="button"
                className="text-muted hover:text-primary transition-colors cursor-pointer"
                onClick={() => switchMode("forgot")}
              >
                {t("forgot")}
              </button>
            </p>
          )}
          {mode === "forgot" && (
            <p className="text-xs text-muted -mt-2">
              {t("forgotDescription")}
            </p>
          )}
          {mode === "signup" && betaRequired && (
            <div>
              <input
                type="text"
                placeholder={t("betaCode")}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className={inputClass}
                required
              />
              <p className="text-xs text-muted mt-1.5">
                {t("noCode")}{" "}
                <button
                  type="button"
                  className="text-primary font-semibold hover:underline cursor-pointer"
                  onClick={() => switchMode("waitlist")}
                >
                  {t("submitWaitlist")}
                </button>
              </p>
            </div>
          )}
          {mode === "waitlist" && betaRequired && (
            <p className="text-xs text-muted -mt-2">
              {t("betaDescription")}
            </p>
          )}

          {error && (
            <div className="text-center">
              <p className="text-error text-sm">{error.headline}</p>
              {error.detail && (
                <details className="mt-1">
                  <summary className="text-xs text-muted cursor-pointer hover:text-foreground select-none">
                    {t("seeError")}
                  </summary>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed text-start">
                    {error.detail}
                  </p>
                </details>
              )}
            </div>
          )}
          {info && <p className="text-primary text-sm text-center">{info}</p>}

          <Button type="submit" size="lg" disabled={loading} className="w-full">
            {loading
              ? "..."
              : mode === "signin"
                ? t("signInButton")
                : mode === "signup"
                  ? t("signUpButton")
                  : mode === "forgot"
                    ? t("forgotButton")
                    : t("waitlistButton")}
          </Button>
        </form>

        <p className="text-center text-sm text-muted mt-4">
          {mode === "signin" ? (
            <>
              {t("noAccountQuestion")}{" "}
              <button
                type="button"
                className="text-primary font-semibold hover:underline cursor-pointer"
                onClick={() => switchMode("signup")}
              >
                {t("signUpLink")}
              </button>
            </>
          ) : (
            <>
              {t("alreadyAccount")}{" "}
              <button
                type="button"
                className="text-primary font-semibold hover:underline cursor-pointer"
                onClick={() => switchMode("signin")}
              >
                {t("signIn")}
              </button>
            </>
          )}
        </p>
      </Card>
      {showLegalLinks && (
        <p className="text-xs text-muted mt-4 flex items-center gap-3">
          <a href="/privacy" className="hover:text-foreground transition-colors">
            {t("privacy")}
          </a>
          <span aria-hidden="true">·</span>
          <a href="/terms" className="hover:text-foreground transition-colors">
            {t("terms")}
          </a>
        </p>
      )}
    </div>
  );
}
