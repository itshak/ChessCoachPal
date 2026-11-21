import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type EffectiveEntitlement,
  type HostedPlan,
  type LimitCheckResult,
  type LimitResource,
  type TeacherEntitlementRow,
} from "@/lib/entitlements";

/**
 * The immutable SQL plan catalogue + independent grants are the only
 * authorization source. This helper is a UX precheck; PostgreSQL serializes
 * each capacity-expanding write under the entitlement-state row lock.
 */
export type SqlCapability = {
  capabilityKey: string;
  kind: "boolean" | "integer_limit";
  planCode: string;
  planVersionId: string;
  enabled: boolean;
  unlimited: boolean;
  limit: number | null;
  evaluatedAt: string;
};
export type AccountEntitlementSummary = {
  revision: number;
  activeStudentCount: number;
  activeProfessionalWorkplaceCount: number;
  studentCapacity: SqlCapability;
  workplaceCapacity: SqlCapability;
  reportPublishing: SqlCapability;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseCapability(value: unknown, key: string): SqlCapability {
  if (!isRecord(value) || value.capabilityKey !== key ||
      (value.kind !== "integer_limit" && value.kind !== "boolean") ||
      typeof value.planCode !== "string" ||
      typeof value.planVersionId !== "string" ||
      typeof value.enabled !== "boolean" ||
      typeof value.unlimited !== "boolean" ||
      (value.limit !== null && (!Number.isSafeInteger(value.limit) ||
        Number(value.limit) < 0)) ||
      typeof value.evaluatedAt !== "string")
    throw new Error("Invalid authoritative entitlement response");
  return value as SqlCapability;
}

/** Tenant identity comes from the authenticated JWT inside the RPC. */
export async function loadAccountEntitlementSummary(
  supabase: SupabaseClient,
): Promise<AccountEntitlementSummary> {
  const {data,error} = await supabase.rpc("ccp_entitlement_summary");
  if (error || !isRecord(data) ||
      !Number.isSafeInteger(data.revision) ||
      !Number.isSafeInteger(data.activeStudentCount) ||
      !Number.isSafeInteger(data.activeProfessionalWorkplaceCount)) {
    throw new Error("Unable to load authoritative account entitlements");
  }
  return {
    revision:data.revision as number,
    activeStudentCount:data.activeStudentCount as number,
    activeProfessionalWorkplaceCount:data.activeProfessionalWorkplaceCount as number,
    studentCapacity:parseCapability(data.studentCapacity,"students.active"),
    workplaceCapacity:parseCapability(data.workplaceCapacity,"workplaces.professional"),
    reportPublishing:parseCapability(data.reportPublishing,"reports.publish"),
  };
}

/** Historical teacher metadata is no longer used for authorization. */
export async function loadTeacherEntitlements(
  supabase: SupabaseClient,
  teacherId: string
): Promise<TeacherEntitlementRow | null> {
  void teacherId;
  const summary=await loadAccountEntitlementSummary(supabase);
  const plan=(summary.studentCapacity.planCode === "pro" ? "pro" : "free");
  return {
    hosted_plan:plan,
    trial_ends_at:null,
    gifted_until:null,
    stripe_subscription_id:null,
    founding_number:null,
  };
}

/** Legacy no-op: expired grants are evaluated by SQL at transaction time. */
export async function persistDemotionIfNeeded(
  supabase: SupabaseClient, teacherId: string, stored: TeacherEntitlementRow | null,
  demotedFrom: "trial" | "gifted" | null,
): Promise<void> {
  void supabase;void teacherId;void stored;void demotedFrom;
}

export async function countActiveStudents(
  supabase: SupabaseClient,
  teacherId: string
): Promise<number> {
  void teacherId;
  return (await loadAccountEntitlementSummary(supabase)).activeStudentCount;
}

/**
 * The SQL commit guard is always final; never trust this read under a race.
 * No deployment ENV, hosted-plan label or Stripe return URL can authorize a
 * capacity expansion.
 */
export async function assertWithinHostedLimit(
  supabase: SupabaseClient,
  teacherId: string,
  resource: LimitResource,
  adding = 1
): Promise<LimitCheckResult> {
  void teacherId;
  if (resource !== "students" || !Number.isSafeInteger(adding) || adding < 0)
    throw new Error("Invalid resource capacity request");
  const state=await loadAccountEntitlementSummary(supabase);
  const capability=state.studentCapacity;
  const currentCount=state.activeStudentCount;
  const limit=capability.unlimited?null:capability.limit;
  if (!capability.unlimited && limit === null)
    throw new Error("Missing SQL capacity ceiling");
  const plan:HostedPlan=capability.planCode==="pro"?"pro":"free";
  const entitlement:EffectiveEntitlement={
    deployment:"hosted",plan,softLimitsApply:!capability.unlimited,
    trialEndsAt:null,giftedUntil:null,demotedFrom:null,
    limits:{maxStudents:limit??Number.MAX_SAFE_INTEGER},
    monthlyPriceCents:0,
  };
  const allowed=limit===null || currentCount+adding<=limit;
  return {
    allowed,entitlement,currentCount,limit,
    ...(allowed ? {} : {
      code:"CAPACITY_EXCEEDED" as unknown as LimitCheckResult["code"],
      message:"Active student capacity exceeded. Archive an unused active student or review plan options.",
    }),
  };
}

export function limitReachedResponse(check: LimitCheckResult) {
  return {
    error:check.message??"Active student capacity reached",
    code:check.code??"CAPACITY_EXCEEDED",
    resourceLimit:check.limit,
    currentCount:check.currentCount,
    plan:check.entitlement.plan,
    upgradePath:"/account",
  };
}
