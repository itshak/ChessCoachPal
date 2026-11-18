"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TeacherPolicy } from "@/lib/schedule";
import { PushNotificationToggle } from "@/components/teacher/settings/PushNotificationToggle";

export function NotificationSettingsForm({
  policy,
  accountEmail,
  pushConfigured,
}: {
  policy: TeacherPolicy;
  accountEmail?: string;
  pushConfigured: boolean;
}) {
  const router = useRouter();
  const t=useTranslations("notificationSettings");
  const toUserError=useLocalizedApiError();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inApp, setInApp] = useState(policy.notify_in_app);
  const [emailCancel, setEmailCancel] = useState(policy.notify_email_portal_cancel);
  const [emailPaid, setEmailPaid] = useState(policy.notify_email_invoice_paid);
  const [bccEnabled, setBccEnabled] = useState(policy.bcc_contact_emails);
  const [bccEmail, setBccEmail] = useState(
    policy.bcc_email ?? accountEmail ?? ""
  );

  // Re-sync after a save/refresh so the field shows the stored address (the
  // API may have defaulted it to the account email).
  const [prevBcc, setPrevBcc] = useState({
    enabled: policy.bcc_contact_emails,
    email: policy.bcc_email,
  });
  if (
    prevBcc.enabled !== policy.bcc_contact_emails ||
    prevBcc.email !== policy.bcc_email
  ) {
    setPrevBcc({ enabled: policy.bcc_contact_emails, email: policy.bcc_email });
    setBccEnabled(policy.bcc_contact_emails);
    setBccEmail(policy.bcc_email ?? accountEmail ?? "");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/settings/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifyInApp: inApp,
        notifyEmailPortalCancel: emailCancel,
        notifyEmailInvoicePaid: emailPaid,
        bccContactEmails: bccEnabled,
        // Only touch the address while the toggle is on, so saving other
        // notification settings doesn't persist an unused address.
        ...(bccEnabled ? { bccEmail } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(toUserError(data, t("saveError")));
      return;
    }
    setMessage(t("saved"));
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-semibold text-lg mb-1">{t("title")}</h2>
      <p className="text-sm text-muted mb-4">
        {t("description")}
      </p>
      <form onSubmit={handleSave} className="space-y-3">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={inApp}
            onChange={(e) => setInApp(e.target.checked)}
          />
          <span>
            <span className="font-medium">
              {t("inApp")}</span>
            <span className="block text-xs text-muted">
              {t("inAppDescription")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={emailCancel}
            onChange={(e) => setEmailCancel(e.target.checked)}
          />
          <span>
            <span className="font-medium">{t("emailCancel")}</span>
            <span className="block text-xs text-muted">
              {t("emailCancelHint")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={emailPaid}
            onChange={(e) => setEmailPaid(e.target.checked)}
          />
          <span>
            <span className="font-medium">{t("emailPaid")}</span>
            <span className="block text-xs text-muted">
              {t("emailPaidHint")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={bccEnabled}
            onChange={(e) => setBccEnabled(e.target.checked)}
          />
          <span>
            <span className="font-medium">{t("bcc")}</span>
            <span className="block text-xs text-muted">
              {t("bccHint")}
            </span>
          </span>
        </label>
        {bccEnabled && (
          <div className="ps-6">
            <label
              htmlFor="bcc-email"
              className="block text-xs font-medium text-muted mb-1"
            >
              {t("bccAddress")}
            </label>
            <input
              id="bcc-email"
              type="email"
              value={bccEmail}
              onChange={(e) => setBccEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
            />
            <p className="text-xs text-muted mt-1">
              {t("bccPrivacy")}
            </p>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      </form>
      <PushNotificationToggle pushConfigured={pushConfigured} />
    </Card>
  );
}
