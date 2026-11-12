import type {SupabaseClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {getPolicy} from "@/lib/server/scheduling";
import {derivePeriodItems,getInvoicedLessonIds} from "@/lib/server/billing";
import {loadCreditInputs} from "@/lib/server/credits";
import {groupItemsByGuardian,sumAmountCents,summarizePayments} from "@/lib/billing";
import {createCheckoutSession,expireCheckoutSession} from "@/lib/payments";
import {familyDisplayName,stripeCheckoutPrefillEmail} from "@/lib/guardians";
import {oneToOne} from "@/lib/schedule";
import {sendInvoice} from "@/lib/server/invoice-send";
import {teacherInvoiceDelete,teacherInvoiceVoid} from "@/lib/server/teacher-invoice-actions";
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type RegenerateOptions={expectedUpdatedAt?:string;idempotencyKey?:string};
function billingConflict(error:{message:string}|null){
  return /23505|23514|REQUEST_CONFLICT|STALE_INVOICE_REVISION|INVOICE_ALREADY_COMMITTED|INVOICE_REGENERATION_BLOCKED/.test(error?.message??"");
}
function validRequestId(value:unknown){
  return value===undefined||(typeof value==="string"&&UUID_RE.test(value));
}

/** Shared website/delegated MCP financial domain services. */
export async function teacherBillingGenerate(supabase:SupabaseClient,teacherId:string,
 body:{periodStart?:string;periodEnd?:string;commit?:boolean;idempotencyKey?:string}):Promise<NextResponse>{
  if(typeof body!=="object"||body===null||Array.isArray(body)||
    Object.keys(body).some(key=>!["periodStart","periodEnd","commit","idempotencyKey"].includes(key))||
    (body.commit!==undefined&&typeof body.commit!=="boolean")||
    !validRequestId(body.idempotencyKey)){
    return NextResponse.json({error:"Invalid billing generation request"},{status:400});
  }
  const periodStart = typeof body.periodStart==="string"?body.periodStart:"";
  const periodEnd = typeof body.periodEnd==="string"?body.periodEnd:"";
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

  // Repeated browser/MCP requests must replay BEFORE recalculating lesson
  // eligibility (the first successful commit consumed those lessons/credits).
  const requestId=body.commit?(body.idempotencyKey??randomUUID()):null;
  if(body.commit&&body.idempotencyKey){
    const {data:prior,error:lookupError}=await supabase.rpc(
      "ccp_invoice_generation_receipt",{
        p_period_start:periodStart,p_period_end:periodEnd,
        p_request_id:body.idempotencyKey,
      });
    if(lookupError) return NextResponse.json({
      error:billingConflict(lookupError)?"Idempotency key used for another billing request":
        "Unable to check billing generation receipt",
    },{status:billingConflict(lookupError)?409:500});
    if(prior) return NextResponse.json(prior);
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

  if (drafts.length === 0 && newRedemptions.size === 0) {
    // Another client may have committed after our initial replay lookup but
    // before this invoice preview. Recheck the receipt before saying empty.
    if(body.idempotencyKey){
      const {data:replayed,error:replayError}=await supabase.rpc(
        "ccp_invoice_generation_receipt",{
          p_period_start:periodStart,p_period_end:periodEnd,
          p_request_id:body.idempotencyKey,
        });
      if(replayError) return NextResponse.json({
        error:"Billing generation request conflicts with an existing receipt",
      },{status:billingConflict(replayError)?409:500});
      if(replayed) return NextResponse.json(replayed);
    }
    return NextResponse.json({
      error: skippedAlreadyInvoiced > 0
        ? "All billable lessons in this period are already on another invoice"
        : "No billable lessons in this period",
    }, {status:400});
  }

  // The database validates teacher/family/lesson ownership and writes ALL
  // related invoices, lines and credit redemptions in one transaction.
  // Any failure rolls back the complete period rather than leaving partly
  // issued invoices or spent credits visible to the website or MCP.
  const {data:committed,error:commitError}=await supabase.rpc(
    "ccp_invoice_generation_commit",{
      p_period_start:periodStart,p_period_end:periodEnd,p_drafts:drafts,
      p_redemptions:[...newRedemptions].map(([lessonId,packageId])=>({
        lessonId,packageId,
      })),
      p_request_id:requestId,
    });
  if(commitError){
    const conflict=billingConflict(commitError);
    return NextResponse.json({
      error:conflict?"Lessons have already been invoiced; refresh the preview":
        "Invoice creation failed and was rolled back",
    },{status:conflict?409:500});
  }
  return NextResponse.json({...committed,skippedAlreadyInvoiced});
}

export async function teacherBillingRegenerate(supabase:SupabaseClient,teacherId:string,id:string,
 options:RegenerateOptions={}):Promise<NextResponse>{
  if(Object.keys(options).some(key=>!["expectedUpdatedAt","idempotencyKey"].includes(key))||
     !validRequestId(options.idempotencyKey)||
     (options.expectedUpdatedAt!==undefined&&
       (typeof options.expectedUpdatedAt!=="string"||
        !Number.isFinite(Date.parse(options.expectedUpdatedAt))))){
    return NextResponse.json({error:"Invalid regeneration revision or request ID"},{status:400});
  }
  // If the caller supplied its original invoice revision, look for the
  // immutable receipt before reading the now-modified invoice.
  if(options.idempotencyKey&&options.expectedUpdatedAt){
    const {data:prior,error:priorError}=await supabase.rpc(
      "ccp_invoice_regeneration_receipt",{
        p_invoice_id:id,p_expected_updated_at:options.expectedUpdatedAt,
        p_request_id:options.idempotencyKey,
      });
    if(priorError) return NextResponse.json({
      error:billingConflict(priorError)?"Idempotency key used for another request":
        "Unable to check invoice regeneration receipt",
    },{status:billingConflict(priorError)?409:500});
    if(prior) return NextResponse.json(prior);
  }
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, guardian_id, period_start, period_end, currency, updated_at, stripe_checkout_session_id, stripe_checkout_url, stripe_payment_intent_id")
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .single();

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if(options.idempotencyKey&&options.expectedUpdatedAt&&
      (invoice.status!=="draft"||
       Date.parse(options.expectedUpdatedAt)!==Date.parse(invoice.updated_at))){
    // A concurrent first commit may have completed after our early receipt
    // lookup. Return its immutable response even if the draft has changed.
    const {data:late,error:lateError}=await supabase.rpc(
      "ccp_invoice_regeneration_receipt",{
        p_invoice_id:id,p_expected_updated_at:options.expectedUpdatedAt,
        p_request_id:options.idempotencyKey,
      });
    if(lateError) return NextResponse.json({
      error:"Regeneration request conflicts with an existing receipt",
    },{status:billingConflict(lateError)?409:500});
    if(late)return NextResponse.json(late);
  }
  if (invoice.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft invoices can be regenerated" },
      { status: 400 }
    );
  }
  if(options.expectedUpdatedAt&&options.expectedUpdatedAt!==invoice.updated_at){
    // Compare real instants, since serialized Postgres timestamps may differ
    // in precision/offset from an otherwise equivalent ISO timestamp.
    if(Date.parse(options.expectedUpdatedAt)!==Date.parse(invoice.updated_at))
      return NextResponse.json({error:"Invoice was edited; review the latest draft"},{status:409});
  }
  if (invoice.stripe_checkout_session_id || invoice.stripe_checkout_url ||
      invoice.stripe_payment_intent_id) {
    return NextResponse.json({
      error: "Reconcile or expire the existing checkout session before regenerating this invoice",
    }, { status: 409 });
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

    // Regeneration never clears the original lines until EVERY new line,
    // redemption and subtotal is known to be valid. One RPC gives both MCP
    // and browser the same all-or-nothing transaction.
    const {data:regenerated,error:regenError}=await supabase.rpc(
      "ccp_invoice_regenerate_atomic",{
        p_invoice_id:id,p_items:items,
        p_redemptions:[...newRedemptions].map(([lessonId,packageId])=>({
          lessonId,packageId,
        })),
        p_expected_updated_at:options.expectedUpdatedAt??invoice.updated_at,
        p_request_id:options.idempotencyKey??randomUUID(),
      });
    if(regenError){
      const conflict=billingConflict(regenError);
      return NextResponse.json({
        error:conflict?"Invoice changed or lessons were already billed; refresh first":
          "Invoice regeneration failed; original lines were preserved",
      },{status:conflict?409:500});
    }
    return NextResponse.json(regenerated);
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

  if(invoice.stripe_checkout_session_id||invoice.stripe_checkout_url){
    if(invoice.stripe_checkout_session_id&&invoice.stripe_checkout_url)
      return NextResponse.json({
        url:invoice.stripe_checkout_url,sessionId:invoice.stripe_checkout_session_id,
      });
    return NextResponse.json({
      error:"Checkout link is incomplete; reconcile with the provider before retrying",
    },{status:409});
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

    // A provider-created session is not yet an invoice checkout link. The
    // database claim atomically rechecks the invoice revision, student-side
    // balance and competing website/MCP checkout requests under row lock.
    const {data:claimed,error:claimError}=await supabase.rpc(
      "ccp_invoice_checkout_claim",{
        p_invoice_id:id,p_session_id:session.sessionId,
        p_checkout_url:session.url,p_expected_balance:balanceCents,
        p_expected_updated_at:invoice.updated_at,
      });
    if(!claimError&&claimed) return NextResponse.json(claimed);

    // Never overwrite a rival client checkout URL. On a losing claim,
    // inspect the committed link before touching a provider session:
    // identical Stripe idempotency sessions are safe to return, but a
    // different, orphaned session must be expired if reconciliation permits.
    const {data:current,error:readError}=await supabase.from("invoices")
      .select("stripe_checkout_session_id,stripe_checkout_url")
      .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
    if(readError||!current){
      return NextResponse.json({
        error:"Checkout claim state unknown; reconcile with Stripe before retrying",
      },{status:503});
    }
    if(current.stripe_checkout_session_id===session.sessionId&&
       current.stripe_checkout_url===session.url)
      return NextResponse.json(session);
    try {
      await expireCheckoutSession(policy.stripe_secret_key,session.sessionId);
    } catch {
      return NextResponse.json({
        error:"Unlinked Stripe checkout may still be open; reconcile the provider session",
      },{status:503});
    }
    return NextResponse.json({
      error:"Invoice changed or another checkout link won the race; refresh before retrying",
    },{status:409});
  } catch (err) {
    // Provider exception strings are not safe to send to a browser or an AI
    // client: they may contain account identifiers, request internals or URLs.
    console.error("Stripe checkout failed",err instanceof Error?err.name:"ProviderError");
    return NextResponse.json(
      { error: "Checkout provider unavailable; reconcile this invoice before retrying" },
      { status: 502 }
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
