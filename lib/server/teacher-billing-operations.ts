import type {SupabaseClient} from "@supabase/supabase-js";
import {NextResponse} from "next/server";
import {getPolicy} from "@/lib/server/scheduling";
import {derivePeriodItems,getInvoicedLessonIds} from "@/lib/server/billing";
import {loadCreditInputs,recordRedemptions} from "@/lib/server/credits";
import {groupItemsByGuardian,sumAmountCents,summarizePayments} from "@/lib/billing";
import {createCheckoutSession} from "@/lib/payments";
import {familyDisplayName,stripeCheckoutPrefillEmail} from "@/lib/guardians";
import {oneToOne} from "@/lib/schedule";
import {sendInvoice} from "@/lib/server/invoice-send";
import {teacherInvoiceDelete,teacherInvoiceVoid} from "@/lib/server/teacher-invoice-actions";
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;

/** Shared website/delegated MCP financial domain services. */
export async function teacherBillingGenerate(supabase:SupabaseClient,teacherId:string,
 body:{periodStart?:string;periodEnd?:string;commit?:boolean}):Promise<NextResponse>{
  const periodStart = String(body.periodStart ?? "");
  const periodEnd = String(body.periodEnd ?? "");
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
    return NextResponse.json(
      { error: "Choose a start and end date" },
      { status: 400 }
    );
  }
  if (periodEnd < periodStart) {
    return NextResponse.json(
      { error: "End date must be on or after the start date" },
      { status: 400 }
    );
  }

  const policy = await getPolicy(supabase, teacherId);
  let result;
  try {
    const [excludeLessonIds, travelInvoicedLessonIds, credits] =
      await Promise.all([
        getInvoicedLessonIds(supabase, teacherId),
        getInvoicedLessonIds(supabase, teacherId, { kind: "travel" }),
        loadCreditInputs(supabase, teacherId),
      ]);
    result = await derivePeriodItems(
      supabase,
      teacherId,
      periodStart,
      periodEnd,
      policy,
      { excludeLessonIds, travelInvoicedLessonIds, credits }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { items, skippedAlreadyInvoiced, newRedemptions, creditedByGuardian } =
    result;
  const groups = groupItemsByGuardian(items);
  const guardianIds = [...groups.keys()];

  const { data: guardians } = guardianIds.length
    ? await supabase
        .from("guardians")
        .select("id, name, family_name")
        .eq("teacher_id", teacherId)
        .in("id", guardianIds)
    : { data: [] };

  const nameById = new Map(
    (guardians ?? []).map((g) => [
      g.id,
      (g.family_name?.trim() || g.name) as string,
    ])
  );

  const drafts = guardianIds.map((guardianId) => {
    const lineItems = groups.get(guardianId)!;
    return {
      guardianId,
      familyName: nameById.get(guardianId) ?? "Family",
      periodStart,
      periodEnd,
      currency: policy.currency,
      subtotalCents: sumAmountCents(lineItems),
      missingRateCount: lineItems.filter((i) => i.missingRate).length,
      creditedLessonCount: creditedByGuardian.get(guardianId) ?? 0,
      items: lineItems,
    };
  });

  if (!body.commit) {
    return NextResponse.json({
      periodStart,
      periodEnd,
      drafts,
      totalFamilies: drafts.length,
      totalCents: drafts.reduce((s, d) => s + d.subtotalCents, 0),
      skippedAlreadyInvoiced,
      creditsToUse: newRedemptions.size,
    });
  }

  // Record credits before writing lesson lines: the database refuses a
  // redemption for a lesson that is already invoiced, and vice versa.
  const redemptionError = await recordRedemptions(
    supabase,
    teacherId,
    newRedemptions
  );
  if (redemptionError) {
    return NextResponse.json({ error: redemptionError }, { status: 500 });
  }

  if (drafts.length === 0 && newRedemptions.size > 0) {
    return NextResponse.json({
      created: [],
      count: 0,
      skippedAlreadyInvoiced,
      creditsUsed: newRedemptions.size,
    });
  }

  if (drafts.length === 0) {
    return NextResponse.json(
      {
        error:
          skippedAlreadyInvoiced > 0
            ? "All billable lessons in this period are already on another invoice"
            : "No billable lessons in this period",
      },
      { status: 400 }
    );
  }

  const created: string[] = [];
  for (const draft of drafts) {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        teacher_id: teacherId,
        guardian_id: draft.guardianId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "draft",
        subtotal_cents: draft.subtotalCents,
        currency: policy.currency,
      })
      .select("id")
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create invoice" },
        { status: 500 }
      );
    }

    const rows = draft.items.map((item, idx) => ({
      invoice_id: invoice.id,
      lesson_id: item.lessonId,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unit_cents: item.unitCents,
      amount_cents: item.amountCents,
      sort_order: idx,
    }));

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(rows);

    if (itemsError) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }
    created.push(invoice.id);
  }

  return NextResponse.json({
    created,
    count: created.length,
    skippedAlreadyInvoiced,
    creditsUsed: newRedemptions.size,
  });
}

export async function teacherBillingRegenerate(supabase:SupabaseClient,teacherId:string,id:string):Promise<NextResponse>{
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, guardian_id, period_start, period_end, currency")
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft invoices can be regenerated" },
      { status: 400 }
    );
  }

  const { data: creditPackage } = await supabase
    .from("credit_packages")
    .select("id")
    .eq("invoice_id", id)
    .maybeSingle();
  if (creditPackage) {
    return NextResponse.json(
      { error: "Prepaid credit invoices have no lessons to regenerate" },
      { status: 400 }
    );
  }

  const policy = await getPolicy(supabase, teacherId);

  try {
    const [excludeLessonIds, travelInvoicedLessonIds, credits] =
      await Promise.all([
        getInvoicedLessonIds(supabase, teacherId, { exceptInvoiceId: id }),
        getInvoicedLessonIds(supabase, teacherId, {
          exceptInvoiceId: id,
          kind: "travel",
        }),
        loadCreditInputs(supabase, teacherId),
      ]);
    const { items, newRedemptions } = await derivePeriodItems(
      supabase,
      teacherId,
      invoice.period_start,
      invoice.period_end,
      policy,
      {
        guardianId: invoice.guardian_id,
        excludeLessonIds,
        travelInvoicedLessonIds,
        credits,
      }
    );

    await supabase.from("invoice_items").delete().eq("invoice_id", id);

    // After clearing this draft's lines, so lessons it held can take a credit.
    const redemptionError = await recordRedemptions(
      supabase,
      teacherId,
      newRedemptions
    );
    if (redemptionError) {
      return NextResponse.json({ error: redemptionError }, { status: 500 });
    }

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("invoice_items").insert(
        items.map((item, idx) => ({
          invoice_id: id,
          lesson_id: item.lessonId,
          kind: item.kind,
          description: item.description,
          quantity: item.quantity,
          unit_cents: item.unitCents,
          amount_cents: item.amountCents,
          sort_order: idx,
        }))
      );
      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }
    }

    const subtotal = sumAmountCents(items);
    const { error } = await supabase
      .from("invoices")
      .update({ subtotal_cents: subtotal })
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      itemCount: items.length,
      subtotalCents: subtotal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function teacherBillingCheckout(supabase:SupabaseClient,teacherId:string,id:string,origin:string):Promise<NextResponse>{
  const policy = await getPolicy(supabase, teacherId);
  if (policy.payment_provider !== "stripe" || !policy.stripe_secret_key) {
    return NextResponse.json(
      { error: "Stripe is not configured for this studio" },
      { status: 400 }
    );
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `
      *,
      guardians (
        id, name, family_name, email, secondary_email, email_recipients
      ),
      payments ( amount_cents )
    `
    )
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (invoice.status !== "sent" && invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Checkout is only available for draft or sent invoices" },
      { status: 400 }
    );
  }
  if (invoice.subtotal_cents <= 0) {
    return NextResponse.json(
      { error: "Invoice total must be greater than zero" },
      { status: 400 }
    );
  }
  // Charge what is still owed after any partial payments.
  const { balanceCents } = summarizePayments(
    invoice.subtotal_cents,
    ((invoice.payments as { amount_cents: number }[] | null) ?? []).map(
      (p) => ({ amountCents: p.amount_cents })
    )
  );
  if (balanceCents <= 0) {
    return NextResponse.json(
      { error: "Nothing is owed on this invoice" },
      { status: 400 }
    );
  }

  if (invoice.stripe_checkout_url && invoice.status === "sent") {
    return NextResponse.json({
      url: invoice.stripe_checkout_url,
      sessionId: invoice.stripe_checkout_session_id,
    });
  }

  const family = oneToOne(
    invoice.guardians as
      | {
          name: string;
          family_name: string | null;
          email: string | null;
          secondary_email: string | null;
          email_recipients: "primary" | "secondary" | "both" | null;
        }
      | {
          name: string;
          family_name: string | null;
          email: string | null;
          secondary_email: string | null;
          email_recipients: "primary" | "secondary" | "both" | null;
        }[]
      | null
  );
  if (!family) {
    return NextResponse.json({ error: "Family not found" }, { status: 400 });
  }

  const periodLabel = `${invoice.period_start} – ${invoice.period_end}`;

  try {
    const session = await createCheckoutSession({
      secretKey: policy.stripe_secret_key,
      invoiceId: id,
      teacherId: teacherId,
      amountCents: balanceCents,
      currency: invoice.currency,
      familyName: familyDisplayName(family),
      studioName: policy.studio_name,
      periodLabel,
      successUrl: `${origin}/billing/${id}?paid=1`,
      cancelUrl: `${origin}/billing/${id}`,
      customerEmail: stripeCheckoutPrefillEmail(family),
    });

    await supabase
      .from("invoices")
      .update({
        stripe_checkout_session_id: session.sessionId,
        stripe_checkout_url: session.url,
      })
      .eq("id", id)
      .eq("teacher_id", teacherId);

    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Stripe checkout failed:", message);
    return NextResponse.json(
      { error: `Stripe error: ${message}` },
      { status: 500 }
    );
  }
}

const ACTIONS = ["send","delete","void"] as const;
type BulkAction=(typeof ACTIONS)[number];
export async function teacherBillingBulk(supabase:SupabaseClient,teacherId:string,
 teacherEmail:string|undefined,origin:string,body:{action?:string;ids?:unknown[]}):Promise<NextResponse>{
  const action = body.action as BulkAction;
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((id): id is string => typeof id === "string")
    : [];

  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be send, delete, or void" },
      { status: 400 }
    );
  }
  if (ids.length === 0) {
    return NextResponse.json({ error: "No invoices selected" }, { status: 400 });
  }
  if (ids.length > 50) {
    return NextResponse.json(
      { error: "Select at most 50 invoices at a time" },
      { status: 400 }
    );
  }

  // Prevent duplicate invoices being processed and emailed twice within one
  // batch request. The model and website must both see the same rejection.
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Select each invoice only once" }, { status: 400 });
  }
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    if (action === "send") {
      const result = await sendInvoice(supabase, {
        invoiceId: id,
        teacherId: teacherId,
        teacherEmail: teacherEmail,
        origin,
      });
      results.push({
        id,
        ok: result.ok,
        error:
          result.error ??
          result.emailError ??
          result.checkoutError,
      });
      continue;
    }

    // Reuse the same credit/paid-status guards as the single-invoice API.
    // A per-invoice failure does not hide successful changes to other IDs.
    try {
      if (action === "delete") await teacherInvoiceDelete(supabase, teacherId, id);
      else await teacherInvoiceVoid(supabase, teacherId, id);
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : "Invoice action failed" });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return NextResponse.json({
    ok: failed.length === 0,
    succeeded,
    failed,
    results,
  });
}
