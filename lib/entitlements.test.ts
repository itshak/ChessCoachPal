import { describe, expect, it } from "vitest";
import {
  evaluateLimit, formatHostedPrice, getDeploymentMode, getHostedLimits,
  hostedSignupFields, requiresBetaCode, resolveEffectivePlan, HOSTED_LIMIT_ERROR_CODE,
} from "@/lib/entitlements";

const free = { hosted_plan:"free", trial_ends_at:null, gifted_until:null };

describe("ChessCoachPal deployment", () => {
  it("defaults to self-hosting and never recognizes the inherited environment variable", () => {
    expect(getDeploymentMode({})).toBe("self_hosted");
    expect(getDeploymentMode({ COGNOTE_DEPLOYMENT:"hosted" })).toBe("self_hosted");
  });
  it("accepts explicit ChessCoachPal hosted mode", () => {
    expect(getDeploymentMode({ CHESSCOACHPAL_DEPLOYMENT:"hosted" })).toBe("hosted");
  });
  it("keeps the beta gate independent of hosting", () => {
    expect(requiresBetaCode({ BETA_ACCESS_CODE:"secret" })).toBe(true);
    expect(requiresBetaCode({ BETA_ACCESS_CODE:"secret", NEXT_PUBLIC_BETA_ONLY:"false" })).toBe(false);
    expect(requiresBetaCode({ NEXT_PUBLIC_BETA_ONLY:"true" })).toBe(true);
  });
  it("never limits local/self-hosted installs", () => {
    const e=resolveEffectivePlan(free,{env:{CHESSCOACHPAL_DEPLOYMENT:"self_hosted"}});
    expect(e.softLimitsApply).toBe(false);
    expect(evaluateLimit(e,"students",10000).allowed).toBe(true);
  });
  it("enforces free hosted student limit but not obsolete music quotas", () => {
    const e=resolveEffectivePlan(free,{env:{CHESSCOACHPAL_DEPLOYMENT:"hosted"}});
    expect(e.softLimitsApply).toBe(true);
    expect(evaluateLimit(e,"students",4).allowed).toBe(true);
    const blocked=evaluateLimit(e,"students",5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.code).toBe(HOSTED_LIMIT_ERROR_CODE);
    expect(blocked.message).toMatch(/self-host/);
    expect(getHostedLimits({HOSTED_FREE_MAX_STUDENTS:"9"}).maxStudents).toBe(9);
  });
  it("honors active trials, and demotes expired trials", () => {
    const now=new Date("2026-07-13T12:00:00Z");
    const env={CHESSCOACHPAL_DEPLOYMENT:"hosted"};
    const trial={hosted_plan:"trial",trial_ends_at:"2026-08-01T00:00:00Z",gifted_until:null};
    expect(resolveEffectivePlan(trial,{env,now}).softLimitsApply).toBe(false);
    expect(resolveEffectivePlan({...trial,trial_ends_at:"2026-07-01T00:00:00Z"},{env,now}).demotedFrom).toBe("trial");
  });
  it("starts trial for hosted registration and not for local", () => {
    expect(hostedSignupFields({CHESSCOACHPAL_DEPLOYMENT:"hosted",HOSTED_TRIAL_DAYS:"30"},new Date("2026-07-13T00:00:00Z")).trial_ends_at).toBe("2026-08-12T00:00:00.000Z");
    expect(hostedSignupFields({CHESSCOACHPAL_DEPLOYMENT:"self_hosted"}).hosted_plan).toBe("free");
  });
  it("formats plan price",()=>expect(formatHostedPrice(500)).toBe("$5"));
});
