import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy } from "@/lib/server/scheduling";
import { maskSecret, validateLiveStripeKeys } from "@/lib/billing";
import {
  normalizeDurationRates,
  serializeDurationRates,
  type InvoiceCadence,
  type PaymentProvider,
  type RateBasis,
} from "@/lib/schedule";
import type { AiProviderId } from "@/lib/ai/provider";
import { isValidPaymentQrDataUrl } from "@/lib/payment-qr";

/**
 * Must match the CHECK constraint on studio_policies.bcc_email. The allowed
 * set keeps characters that would break an SMTP RCPT TO (`<`, `>`, `,`, etc.)
 * out of the stored address.
 */
const BCC_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const BCC_EMAIL_MAX_LENGTH = 320;

/** Client-safe policy: secrets are masked, never returned in full. */
function toClientPolicy(
  policy: Awaited<ReturnType<typeof getPolicy>>,
  teacherId: string
) {
  const {
    stripe_secret_key,
    stripe_publishable_key,
    stripe_webhook_secret,
    ai_api_key,
    ...rest
  } = policy;
  return {
    ...rest,
    teacherId,
    stripe_secret_key: null,
    stripe_publishable_key: null,
    stripe_webhook_secret: null,
    ai_api_key: null,
    stripe: {
      secretKey: {
        configured: !!stripe_secret_key,
        masked: maskSecret(stripe_secret_key),
      },
      publishableKey: {
        configured: !!stripe_publishable_key,
        masked: maskSecret(stripe_publishable_key),
      },
      webhookSecret: {
        configured: !!stripe_webhook_secret,
        masked: maskSecret(stripe_webhook_secret),
      },
    },
    ai: {
      apiKey: {
        configured: !!ai_api_key,
        masked: maskSecret(ai_api_key),
      },
    },
  };
}

/** All website and delegated MCP policy reads use one masking boundary. */
export async function teacherPolicyView(db:SupabaseClient,teacherId:string){
  const policy=await getPolicy(db,teacherId);
  return toClientPolicy(policy,teacherId);
}
/** The same policy validation and persistence path for website and MCP.
 * Authentication, secret-input allowlisting and approval happen in the adapters.
 * Return the full response status so neither surface can silently ignore errors.
 */
export async function teacherPolicyUpdate(
  db:SupabaseClient,teacherId:string,teacherEmail:string|undefined,body:Record<string,unknown>
):Promise<NextResponse> {
  const supabase=db;
  const user={id:teacherId,email:teacherEmail};

  // Website and MCP must reject malformed settings before persistence. In
  // particular Boolean("false") is true, and rounding cents changes intent.
  const booleanFields=[
    "timelyCancelEarnsMakeup","lateCancelEarnsMakeup","noShowEarnsMakeup",
    "teacherCancelEarnsMakeup","billAttended","billNoShow",
    "billTeacherCancel","billTimelyStudentCancel","billLateStudentCancel",
    "billMakeup","notifyInApp","notifyEmailPortalCancel",
    "notifyEmailInvoicePaid","bccFamilyEmails",
  ];
  for(const key of booleanFields){
    if(body[key]!==undefined&&typeof body[key]!=="boolean")
      return NextResponse.json({error:key+" must be a boolean"},{status:400});
  }
  for(const key of ["clearStripeSecretKey","clearStripePublishableKey",
    "clearStripeWebhookSecret","clearAiApiKey"]){
    if(body[key]!==undefined&&body[key]!==true)
      return NextResponse.json({error:key+" must be true when present"},{status:400});
  }
  const wholeCents=(value:unknown):number|null|undefined=>{
    if(value===null||value==="")return null;
    if(typeof value==="string"){
      const normalized=value.trim();
      if(normalized==="")return null;
      if(!/^[0-9]{1,8}$/.test(normalized))return undefined;
      value=Number(normalized);
    }
    return typeof value==="number"&&Number.isSafeInteger(value)&&
      value>=0&&value<=10_000_000?value:undefined;
  };
  const defaultRate=body.defaultRateCents===undefined?undefined:wholeCents(body.defaultRateCents);
  const travelRate=body.travelFeeCents===undefined?undefined:wholeCents(body.travelFeeCents);
  if(body.defaultRateCents!==undefined&&defaultRate===undefined ||
     body.travelFeeCents!==undefined&&travelRate===undefined)
    return NextResponse.json({error:"Rates and travel fees must be 0–10,000,000 whole cents"},{status:400});
  if(body.cancellationWindowHours!==undefined&&(
    typeof body.cancellationWindowHours!=="number"||
    !Number.isFinite(body.cancellationWindowHours)||
    body.cancellationWindowHours<0||body.cancellationWindowHours>8760))
    return NextResponse.json({error:"Invalid cancellation window hours"},{status:400});
  if(body.makeupCreditExpiryDays!==undefined&&body.makeupCreditExpiryDays!==null&&(
    typeof body.makeupCreditExpiryDays!=="number"||
    !Number.isSafeInteger(body.makeupCreditExpiryDays)||
    body.makeupCreditExpiryDays<0||body.makeupCreditExpiryDays>3650))
    return NextResponse.json({error:"Invalid makeup credit expiry days"},{status:400});
  if(body.durationRateCents!==undefined){
    const rates=body.durationRateCents;
    if(!rates||typeof rates!=="object"||Array.isArray(rates)||
      Object.entries(rates).some(([minutes,cents])=>
        !/^[0-9]{1,3}$/.test(minutes)||Number(minutes)<5||Number(minutes)>240||
        typeof cents!=="number"||!Number.isSafeInteger(cents)||
        cents<0||cents>10_000_000))
      return NextResponse.json({error:"Duration rates must map 5–240 minutes to whole cents"},{status:400});
  }
  if(body.currency!==undefined&&(
    typeof body.currency!=="string"||!/^[a-zA-Z]{3}$/.test(body.currency.trim())))
    return NextResponse.json({error:"Currency must be a three-letter code"},{status:400});

  if (body.timezone !== undefined) {
    const { isValidTimezone } = await import("@/lib/timezones");
    if (typeof body.timezone !== "string" || !isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
  }

  let durationOptions: number[] | undefined;
  if (body.lessonDurationOptions !== undefined) {
    if (!Array.isArray(body.lessonDurationOptions)) {
      return NextResponse.json(
        { error: "lessonDurationOptions must be an array" },
        { status: 400 }
      );
    }
    if(body.lessonDurationOptions.length===0||body.lessonDurationOptions.length>20||
      body.lessonDurationOptions.some(v=>typeof v!=="number"||
        !Number.isInteger(v)||v<5||v>240))
      return NextResponse.json({error:"Provide 1–20 valid integer time blocks (5–240 minutes)"},{status:400});
    durationOptions = [...new Set(body.lessonDurationOptions)].sort((a, b) => a - b);
    if (durationOptions.length === 0) {
      return NextResponse.json(
        { error: "At least one time block between 5 and 240 minutes is required" },
        { status: 400 }
      );
    }
  }

  const cadence = body.invoiceCadence as InvoiceCadence | undefined;
  if (cadence !== undefined && cadence !== "monthly" && cadence !== "manual") {
    return NextResponse.json(
      { error: "invoiceCadence must be monthly or manual" },
      { status: 400 }
    );
  }

  const rateBasis = body.rateBasis as RateBasis | undefined;
  if (
    rateBasis !== undefined &&
    rateBasis !== "per_lesson" &&
    rateBasis !== "per_hour"
  ) {
    return NextResponse.json(
      { error: "rateBasis must be per_lesson or per_hour" },
      { status: 400 }
    );
  }

  const paymentProvider = body.paymentProvider as PaymentProvider | undefined;
  if (
    paymentProvider !== undefined &&
    paymentProvider !== "manual" &&
    paymentProvider !== "stripe"
  ) {
    return NextResponse.json(
      { error: "paymentProvider must be manual or stripe" },
      { status: 400 }
    );
  }

  const aiProvider = body.aiProvider as AiProviderId | undefined;
  if (
    aiProvider !== undefined &&
    aiProvider !== "none" &&
    aiProvider !== "openai" &&
    aiProvider !== "anthropic"
  ) {
    return NextResponse.json(
      { error: "aiProvider must be none, openai, or anthropic" },
      { status: 400 }
    );
  }

  const paymentQrCode = body.paymentQrCode as string | null | undefined;
  if (
    paymentQrCode !== undefined &&
    paymentQrCode !== null &&
    !isValidPaymentQrDataUrl(paymentQrCode)
  ) {
    return NextResponse.json(
      { error: "Payment QR code must be a PNG or JPEG image under 300 KB" },
      { status: 400 }
    );
  }

  const bccFamilyEmails = body.bccFamilyEmails as boolean | undefined;
  let bccEmail: string | null | undefined;
  if (body.bccEmail !== undefined) {
    const trimmed = body.bccEmail === null ? "" : String(body.bccEmail).trim();
    if (trimmed.length > BCC_EMAIL_MAX_LENGTH) {
      return NextResponse.json(
        { error: "BCC email address is too long" },
        { status: 400 }
      );
    }
    if (trimmed && !BCC_EMAIL_RE.test(trimmed)) {
      return NextResponse.json(
        { error: "Enter a valid email address to BCC" },
        { status: 400 }
      );
    }
    bccEmail = trimmed || null;
  }

  const upsert: Record<string, unknown> = {
    teacher_id: user.id,
    ...(body.studioName !== undefined && {
      studio_name: String(body.studioName).trim().slice(0, 120),
    }),
    ...(body.studioWebsite !== undefined && {
      studio_website: String(body.studioWebsite).trim().slice(0, 300),
    }),
    ...(body.studioContact !== undefined && {
      studio_contact: String(body.studioContact).trim().slice(0, 300),
    }),
    ...(body.studioInfo !== undefined && {
      studio_info: String(body.studioInfo).trim().slice(0, 5000),
    }),
    ...(body.lessonLabel !== undefined && {
      lesson_label: String(body.lessonLabel).trim().slice(0, 60),
    }),
    ...(durationOptions !== undefined && {
      lesson_duration_options: durationOptions,
    }),
    ...(body.timezone !== undefined && { timezone: body.timezone }),
    ...(body.cancellationWindowHours !== undefined && {
      cancellation_window_hours: Number(body.cancellationWindowHours),
    }),
    ...(body.timelyCancelEarnsMakeup !== undefined && {
      timely_cancel_earns_makeup: Boolean(body.timelyCancelEarnsMakeup),
    }),
    ...(body.lateCancelEarnsMakeup !== undefined && {
      late_cancel_earns_makeup: Boolean(body.lateCancelEarnsMakeup),
    }),
    ...(body.noShowEarnsMakeup !== undefined && {
      no_show_earns_makeup: Boolean(body.noShowEarnsMakeup),
    }),
    ...(body.teacherCancelEarnsMakeup !== undefined && {
      teacher_cancel_earns_makeup: Boolean(body.teacherCancelEarnsMakeup),
    }),
    ...(body.makeupCreditExpiryDays !== undefined && {
      makeup_credit_expiry_days: body.makeupCreditExpiryDays === null ? null : body.makeupCreditExpiryDays,
    }),
    // Billing
    ...(body.billAttended !== undefined && {
      bill_attended: Boolean(body.billAttended),
    }),
    ...(body.billNoShow !== undefined && {
      bill_no_show: Boolean(body.billNoShow),
    }),
    ...(body.billTeacherCancel !== undefined && {
      bill_teacher_cancel: Boolean(body.billTeacherCancel),
    }),
    ...(body.billTimelyStudentCancel !== undefined && {
      bill_timely_student_cancel: Boolean(body.billTimelyStudentCancel),
    }),
    ...(body.billLateStudentCancel !== undefined && {
      bill_late_student_cancel: Boolean(body.billLateStudentCancel),
    }),
    ...(body.billMakeup !== undefined && {
      bill_makeup: Boolean(body.billMakeup),
    }),
    ...(body.defaultRateCents !== undefined && {
      default_rate_cents:
        defaultRate,
    }),
    ...(body.durationRateCents !== undefined && {
      duration_rate_cents: serializeDurationRates(
        normalizeDurationRates(body.durationRateCents)
      ),
    }),
    ...(body.travelFeeCents !== undefined && {
      travel_fee_cents:
        travelRate,
    }),
    ...(rateBasis !== undefined && { rate_basis: rateBasis }),
    ...(body.currency !== undefined && {
      currency: (body.currency as string).trim().toUpperCase(),
    }),
    ...(cadence !== undefined && { invoice_cadence: cadence }),
    ...(body.paymentInstructions !== undefined && {
      payment_instructions: String(body.paymentInstructions).slice(0, 2000),
    }),
    ...(paymentQrCode !== undefined && { payment_qr_code: paymentQrCode }),
    ...(paymentProvider !== undefined && {
      payment_provider: paymentProvider,
    }),
    ...(body.notifyInApp !== undefined && {
      notify_in_app: Boolean(body.notifyInApp),
    }),
    ...(body.notifyEmailPortalCancel !== undefined && {
      notify_email_portal_cancel: Boolean(body.notifyEmailPortalCancel),
    }),
    ...(body.notifyEmailInvoicePaid !== undefined && {
      notify_email_invoice_paid: Boolean(body.notifyEmailInvoicePaid),
    }),
    ...(bccFamilyEmails !== undefined && {
      bcc_family_emails: Boolean(bccFamilyEmails),
    }),
    ...(bccEmail !== undefined && { bcc_email: bccEmail }),
    ...(aiProvider !== undefined && { ai_provider: aiProvider }),
  };

  // Stripe keys: only overwrite when a new value is pasted, or explicitly
  // cleared. Secrets are encrypted at rest (decrypted in getPolicy).
  // Reject test/sandbox keys so teachers don't collect live payments on a
  // test account. Check the effective keys after this save (new paste or
  // already-stored) whenever Stripe is (or will be) the provider.
  const { encryptSecret } = await import("@/lib/token");
  const currentPolicy = await getPolicy(supabase, user.id);

  // Default the BCC address to the account email when the toggle is turned on
  // without an explicit address, so one click yields a usable setting.
  const bccEnabled = bccFamilyEmails ?? currentPolicy.bcc_family_emails;
  const nextBccEmail =
    "bcc_email" in upsert
      ? (upsert.bcc_email as string | null)
      : currentPolicy.bcc_email;
  if (bccEnabled && !nextBccEmail) {
    if (!user.email) {
      return NextResponse.json(
        { error: "Add an email address to BCC" },
        { status: 400 }
      );
    }
    upsert.bcc_email = user.email;
  }

  const nextSecretRaw = body.clearStripeSecretKey
    ? null
    : typeof body.stripeSecretKey === "string" && body.stripeSecretKey.trim()
      ? body.stripeSecretKey.trim()
      : undefined;
  const nextPublishableRaw = body.clearStripePublishableKey
    ? null
    : typeof body.stripePublishableKey === "string" &&
        body.stripePublishableKey.trim()
      ? body.stripePublishableKey.trim()
      : undefined;

  const effectiveProvider = paymentProvider ?? currentPolicy.payment_provider;
  if (effectiveProvider === "stripe") {
    const keyError = validateLiveStripeKeys({
      secretKey:
        nextSecretRaw === undefined
          ? currentPolicy.stripe_secret_key
          : nextSecretRaw,
      publishableKey:
        nextPublishableRaw === undefined
          ? currentPolicy.stripe_publishable_key
          : nextPublishableRaw,
    });
    if (keyError) {
      return NextResponse.json({ error: keyError }, { status: 400 });
    }
  }

  if (body.clearStripeSecretKey) upsert.stripe_secret_key = null;
  else if (nextSecretRaw) {
    upsert.stripe_secret_key = encryptSecret(nextSecretRaw);
  }
  if (body.clearStripePublishableKey) upsert.stripe_publishable_key = null;
  else if (nextPublishableRaw) {
    upsert.stripe_publishable_key = nextPublishableRaw;
  }
  if (body.clearStripeWebhookSecret) upsert.stripe_webhook_secret = null;
  else if (
    typeof body.stripeWebhookSecret === "string" &&
    body.stripeWebhookSecret.trim()
  ) {
    upsert.stripe_webhook_secret = encryptSecret(body.stripeWebhookSecret.trim());
  }

  if (body.clearAiApiKey) upsert.ai_api_key = null;
  else if (typeof body.aiApiKey === "string" && body.aiApiKey.trim()) {
    upsert.ai_api_key = encryptSecret(body.aiApiKey.trim());
  }
  if (aiProvider === "none") {
    upsert.ai_api_key = null;
  }

  // Bump policies_updated_at when a family-relevant field actually changes,
  // so the portal can show its one-time "policies were updated" banner.
  const FAMILY_RELEVANT_FIELDS = [
    "cancellation_window_hours",
    "timely_cancel_earns_makeup",
    "late_cancel_earns_makeup",
    "no_show_earns_makeup",
    "teacher_cancel_earns_makeup",
    "makeup_credit_expiry_days",
    "bill_attended",
    "bill_no_show",
    "bill_teacher_cancel",
    "bill_timely_student_cancel",
    "bill_late_student_cancel",
    "bill_makeup",
    "invoice_cadence",
  ] as const;
  const familyRelevantChanged = FAMILY_RELEVANT_FIELDS.some(
    (field) =>
      field in upsert &&
      upsert[field] !== (currentPolicy as unknown as Record<string, unknown>)[field]
  );
  if (familyRelevantChanged) {
    upsert.policies_updated_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("studio_policies")
    .upsert(upsert, { onConflict: "teacher_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Re-fetch through getPolicy so defaults merge, then mask for the client
  const policy = await getPolicy(supabase, user.id);
  return NextResponse.json(toClientPolicy(policy, user.id));
}
