"use client";

import { useRef, useState } from "react";
import {useTranslations} from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { StudioPolicy, PaymentProvider } from "@/lib/schedule";
import {
  validateLiveStripeKeys,
  type StripeKeyStatus,
} from "@/lib/billing";
import {
  PAYMENT_QR_ACCEPT,
  PAYMENT_QR_MAX_DATA_URL_LENGTH,
  PAYMENT_QR_MAX_DIMENSION,
  PAYMENT_QR_MAX_INPUT_BYTES,
} from "@/lib/payment-qr";

const inputClass =
  "px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm";

export type { StripeKeyStatus };

export function PaymentsSettingsForm({
  policy,
  teacherId,
  stripeStatus,
  embedded = false,
  onSaved,
}: {
  policy: StudioPolicy;
  teacherId: string;
  stripeStatus: StripeKeyStatus;
  /** When true, skip outer Card/h2 (used inside Billing payment settings modal). */
  embedded?: boolean;
  /** Called after a successful save (e.g. close the Billing modal). */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const t=useTranslations("paymentSettings");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [provider, setProvider] = useState<PaymentProvider>(
    policy.payment_provider
  );
  const [instructions, setInstructions] = useState(policy.payment_instructions);
  const [qrCode, setQrCode] = useState<string | null>(policy.payment_qr_code);
  const [qrDirty, setQrDirty] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clearSecret, setClearSecret] = useState(false);
  const [clearPublishable, setClearPublishable] = useState(false);
  const [clearWebhook, setClearWebhook] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-host";
  const webhookUrl = `${origin}/api/webhooks/stripe/${teacherId}`;

  async function onQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setQrError(null);
    if (!file.type.startsWith("image/")) {
      setQrError(t("chooseImage"));
      return;
    }
    if (file.size > PAYMENT_QR_MAX_INPUT_BYTES) {
      setQrError(t("imageSize"));
      return;
    }
    try {
      setQrCode(await qrImageToDataUrl(file,{read:t("readImage"),process:t("processImage"),tooDetailed:t("cropImage")}));
      setQrDirty(true);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : t("readImage"));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    if (provider === "stripe") {
      const keyError = validateLiveStripeKeys({
        secretKey: secretKey.trim() || null,
        publishableKey: publishableKey.trim() || null,
      });
      if (keyError) {
        setBusy(false);
        setMessage(keyError);
        setTimeout(() => setMessage(null), 4000);
        return;
      }
    }

    const res = await fetch("/api/settings/policy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentProvider: provider,
        paymentInstructions: instructions,
        ...(qrDirty && { paymentQrCode: qrCode }),
        ...(secretKey.trim() && { stripeSecretKey: secretKey.trim() }),
        ...(publishableKey.trim() && {
          stripePublishableKey: publishableKey.trim(),
        }),
        ...(webhookSecret.trim() && {
          stripeWebhookSecret: webhookSecret.trim(),
        }),
        ...(clearSecret && { clearStripeSecretKey: true }),
        ...(clearPublishable && { clearStripePublishableKey: true }),
        ...(clearWebhook && { clearStripeWebhookSecret: true }),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage(t("saved"));
      setSecretKey("");
      setPublishableKey("");
      setWebhookSecret("");
      setClearSecret(false);
      setClearPublishable(false);
      setClearWebhook(false);
      setQrDirty(false);
      router.refresh();
      onSaved?.();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? t("saveError"));
      setTimeout(() => setMessage(null), 2500);
    }
  }

  const saveRow = (
    <div className="flex items-center gap-3">
      <Button type="submit" size="sm" disabled={busy}>
        {busy?t("saving"):t("save")}
      </Button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </div>
  );

  const fields = (
    <>
      <fieldset>
        <legend className="text-xs font-semibold text-muted mb-1">
          {t("provider")}
        </legend>
        <div className="space-y-1.5 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="paymentProvider"
              checked={provider === "manual"}
              onChange={() => setProvider("manual")}
            />
            {t("manual")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="paymentProvider"
              checked={provider === "stripe"}
              onChange={() => setProvider("stripe")}
            />
            {t("stripe")}
          </label>
        </div>
      </fieldset>

      {provider === "manual" && (
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("instructions")}
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t("instructionsPlaceholder")}
            rows={3}
            maxLength={2000}
            className={`${inputClass} w-full resize-y`}
          />
          <span className="block text-xs text-muted mt-1">
            {t("instructionsHint")}
          </span>
        </label>
      )}

      {provider === "manual" && (
        <div className="text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">
            {t("qrCode")}
          </span>
          <div className="flex items-start gap-3">
            {qrCode ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCode}
                alt={t("qrAlt")}
                className="h-28 w-28 rounded-lg border border-border bg-white object-contain p-1"
              />
            ) : (
              <div className="h-28 w-28 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted text-center px-2">
                {t("noQr")}
              </div>
            )}
            <div className="flex flex-col items-start gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => qrInputRef.current?.click()}
              >
                {qrCode?t("replaceImage"):t("uploadImage")}
              </Button>
              {qrCode && (
                <button
                  type="button"
                  onClick={() => {
                    setQrCode(null);
                    setQrDirty(true);
                    setQrError(null);
                  }}
                  className="text-xs text-muted hover:text-foreground cursor-pointer"
                >
                  {t("removeImage")}
                </button>
              )}
              {qrError && <span className="text-xs text-error">{qrError}</span>}
            </div>
          </div>
          <input
            ref={qrInputRef}
            type="file"
            accept={PAYMENT_QR_ACCEPT}
            className="hidden"
            onChange={onQrFileChange}
          />
          <span className="block text-xs text-muted mt-1">
            {t("qrHint")}
          </span>
        </div>
      )}

      {provider === "stripe" && (
        <div className="space-y-3 border-t border-border pt-3">
          <details className="rounded-lg border border-border bg-surface-dim/40 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-foreground select-none">
              {t("setupTitle")}
            </summary>
            <ol className="mt-2 list-decimal ps-5 space-y-2 text-xs text-muted leading-relaxed">
              <li>{t("stepKeysA")} <strong>Developers → API keys</strong>. {t("stepKeysB")} <strong>Standard keys</strong>:
                <code className="text-[11px]">sk_live_…</code> {t("and")} <code className="text-[11px]">pk_live_…</code>.
                {t("stepKeysC")} <code className="text-[11px]">rk_…</code> {t("or")} <code className="text-[11px]">sk_test_…</code>.</li>
              <li>{t("stepWebhookA")} <strong>Workbench → Webhooks</strong> {t("stepWebhookB")}
                <code className="text-[11px]">checkout.session.completed</code>. {t("stepWebhookC")}
                <code className="text-[11px]">whsec_…</code> {t("stepWebhookD")}</li>
              <li>{t("stepRisk")}</li>
            </ol>
            <p className="mt-2 text-xs text-muted">
              {t("moreDetail")}{" "}
              <Link href="/help#billing-payments" className="text-primary hover:underline">
                {t("billingHelp")}
              </Link>
            </p>
          </details>

          <KeyField
            label={t("secretKey")}
            placeholder={
              stripeStatus.secretConfigured
                ? stripeStatus.secretMasked ?? "••••••••"
                : "sk_live_…"
            }
            value={secretKey}
            onChange={setSecretKey}
            configured={stripeStatus.secretConfigured}
            clear={clearSecret}
            onClearChange={setClearSecret}
          />
          <KeyField
            label={t("publishableKey")}
            placeholder={
              stripeStatus.publishableConfigured
                ? stripeStatus.publishableMasked ?? "••••••••"
                : "pk_live_…"
            }
            value={publishableKey}
            onChange={setPublishableKey}
            configured={stripeStatus.publishableConfigured}
            clear={clearPublishable}
            onClearChange={setClearPublishable}
          />
          <KeyField
            label={t("webhookKey")}
            placeholder={
              stripeStatus.webhookConfigured
                ? stripeStatus.webhookMasked ?? "••••••••"
                : "whsec_…"
            }
            value={webhookSecret}
            onChange={setWebhookSecret}
            configured={stripeStatus.webhookConfigured}
            clear={clearWebhook}
            onClearChange={setClearWebhook}
          />

          <div className="text-sm">
            <span className="block text-xs font-semibold text-muted mb-1">
              {t("endpoint")}
            </span>
            <code className="block text-xs bg-surface-dim px-2 py-2 rounded break-all">
              {webhookUrl}
            </code>
            <span className="block text-xs text-muted mt-1">
              {t("listenFor")} <code className="text-[11px]">checkout.session.completed</code> {t("listenOnly")}
            </span>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <form
        onSubmit={handleSave}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {fields}
        </div>
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3">
          {saveRow}
        </div>
      </form>
    );
  }

  return (
    <Card padding="sm">
      <h2 className="font-semibold mb-3">{t("title")}</h2>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {fields}
        {saveRow}
      </form>
    </Card>
  );
}

function KeyField({
  label,
  placeholder,
  value,
  onChange,
  configured,
  clear,
  onClearChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  configured: boolean;
  clear: boolean;
  onClearChange: (v: boolean) => void;
}) {
  const t=useTranslations("paymentSettings");
  return (
    <label className="text-sm block">
      <span className="block text-xs font-semibold text-muted mb-1">
        {label}
        {configured && !clear && (
          <span className="ms-2 font-normal text-success">{t("configured")}</span>
        )}
      </span>
      <input
        type="password"
        autoComplete="off"
        value={clear ? "" : value}
        onChange={(e) => {
          onChange(e.target.value);
          if (clear) onClearChange(false);
        }}
        placeholder={clear?t("clearOnSave"):placeholder}
        disabled={clear}
        className={`${inputClass} w-full font-mono`}
      />
      {configured && (
        <label className="flex items-center gap-2 mt-1 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={clear}
            onChange={(e) => {
              onClearChange(e.target.checked);
              if (e.target.checked) onChange("");
            }}
          />
          {t("clearSaved",{label})}
        </label>
      )}
    </label>
  );
}

/**
 * Downscale an uploaded QR image and re-encode it as a data URL small enough
 * to store on the policy. PNG keeps QR edges crisp; JPEG is the fallback for
 * photos of a QR code that PNG can't compress under the limit.
 */
async function qrImageToDataUrl(file: File, errors:{read:string;process:string;tooDetailed:string}): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(errors.read));
      el.src = url;
    });
    const scale = Math.min(
      1,
      PAYMENT_QR_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(errors.process);
    // White backdrop so transparent PNGs stay scannable (and JPEG-safe).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const png = canvas.toDataURL("image/png");
    if (png.length <= PAYMENT_QR_MAX_DATA_URL_LENGTH) return png;
    const jpeg = canvas.toDataURL("image/jpeg", 0.9);
    if (jpeg.length <= PAYMENT_QR_MAX_DATA_URL_LENGTH) return jpeg;
    throw new Error(errors.tooDetailed);
  } finally {
    URL.revokeObjectURL(url);
  }
}
