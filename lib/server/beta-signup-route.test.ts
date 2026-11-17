import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  adminCreateUser: vi.fn(),
  adminInviteUserByEmail: vi.fn(),
  adminUpdateUserById: vi.fn(),
  adminDeleteUser: vi.fn(),
  ensureTeacherForAuthUser: vi.fn(),
  checkRateLimit: vi.fn(),
  hitRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword },
  })),
  createServiceClient: vi.fn(() => ({
    auth: { admin: {
      createUser: mocks.adminCreateUser,
      inviteUserByEmail: mocks.adminInviteUserByEmail,
      updateUserById: mocks.adminUpdateUserById,
      deleteUser: mocks.adminDeleteUser,
    } },
  })),
}));
vi.mock("@/lib/server/ensure-teacher", () => ({
  ensureTeacherForAuthUser: mocks.ensureTeacherForAuthUser,
}));
vi.mock("@/lib/rateLimit", () => ({
  BETA_GUESS_LIMIT: 5,
  BETA_GUESS_WINDOW_MS: 60_000,
  clientIpFromRequest: () => "127.0.0.1",
  checkRateLimit: mocks.checkRateLimit,
  hitRateLimit: mocks.hitRateLimit,
}));

import { POST } from "@/app/api/auth/signup/route";

function request(accessCode?: string,preferredLocale?:unknown) {
  return new NextRequest("https://beta.chesscoachpal.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "teacher@example.test",
      password: "ValidPassword123!",
      displayName: "Beta Teacher",
      timezone: "Asia/Jerusalem",
      accessCode,
      ...(preferredLocale===undefined?{}:{preferredLocale}),
    }),
  });
}

describe("private beta signup cannot bypass disabled public GoTrue signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_BETA_ONLY", "true");
    vi.stubEnv("BETA_ACCESS_CODE", "private-test-code");
    vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", "true");
    vi.stubEnv("BETA_GOTRUE_EMAIL_AUTOCONFIRM", "true");
    vi.stubEnv("BETA_EMAIL_VERIFICATION_ENABLED", "false");
    mocks.adminInviteUserByEmail.mockResolvedValue({
      data: { user: { id: "new-beta-invitee" } }, error: null,
    });
    mocks.adminUpdateUserById.mockResolvedValue({ error: null });
    mocks.adminDeleteUser.mockResolvedValue({ error: null });
    mocks.checkRateLimit.mockReturnValue({ ok: true });
    mocks.adminCreateUser.mockResolvedValue({
      data: { user: { id: "new-beta-teacher" } }, error: null,
    });
    mocks.ensureTeacherForAuthUser.mockResolvedValue({ ok: true, created: true });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects missing and incorrect invite codes before touching Auth", async () => {
    for (const code of [undefined, "incorrect"]) {
      const response = await POST(request(code));
      expect(response.status).toBe(403);
    }
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.hitRateLimit).toHaveBeenCalledTimes(2);
  });

  it("fails closed when public GoTrue signup is not disabled", async () => {
    for (const config of ["false", ""]) {
      vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", config);
      const response = await POST(request("private-test-code"));
      expect(response.status).toBe(503);
    }
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not auto-verify an email if the operator disabled auto-confirm", async () => {
    vi.stubEnv("BETA_GOTRUE_EMAIL_AUTOCONFIRM", "false");
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(503);
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it("creates the beta user with the server-only admin API, not public signup", async () => {
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.adminCreateUser).toHaveBeenCalledExactlyOnceWith({
      email: "teacher@example.test",
      password: "ValidPassword123!",
      email_confirm: true,
      user_metadata: { display_name: "Beta Teacher", timezone: "Asia/Jerusalem" },
    });
    expect(mocks.ensureTeacherForAuthUser).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "new-beta-teacher", email: "teacher@example.test", displayName: "Beta Teacher", timezone: "Asia/Jerusalem" }
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: "teacher@example.test", password: "ValidPassword123!",
    });
  });

  it("does not expose existing-user details or provision on admin creation errors", async () => {
    mocks.adminCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("already been registered");
    expect(mocks.ensureTeacherForAuthUser).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps ordinary public signup for installations without a beta gate", async () => {
    vi.stubEnv("NEXT_PUBLIC_BETA_ONLY", "false");
    vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", "false");
    mocks.signUp.mockResolvedValue({ data: {
      user: { id: "open-selfhost-teacher", identities: [{ id: "email" }] },
    }, error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    expect(mocks.ensureTeacherForAuthUser).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ userId: "open-selfhost-teacher" })
    );
  });

  it("does not create an account if the invite code is not configured", async () => {
    vi.stubEnv("BETA_ACCESS_CODE", "");
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(503);
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });
});

describe("private beta verified invitation activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_BETA_ONLY", "true");
    vi.stubEnv("BETA_ACCESS_CODE", "private-test-code");
    vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", "true");
    vi.stubEnv("BETA_EMAIL_VERIFICATION_ENABLED", "true");
    vi.stubEnv("BETA_GOTRUE_EMAIL_AUTOCONFIRM", "false");
    mocks.checkRateLimit.mockReturnValue({ ok: true });
    mocks.adminInviteUserByEmail.mockResolvedValue({
      data: { user: { id: "verified-beta-invitee" } }, error: null,
    });
    mocks.adminUpdateUserById.mockResolvedValue({ error: null });
    mocks.adminDeleteUser.mockResolvedValue({ error: null });
    mocks.ensureTeacherForAuthUser.mockResolvedValue({ ok: true, created: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires an access code before sending any invitation email", async () => {
    expect((await POST(request("wrong-code"))).status).toBe(403);
    expect(mocks.adminInviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it("requires disabled public GoTrue signup and disabled auto-confirm", async () => {
    vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", "false");
    expect((await POST(request("private-test-code"))).status).toBe(503);
    vi.stubEnv("BETA_GOTRUE_SIGNUP_DISABLED", "true");
    vi.stubEnv("BETA_GOTRUE_EMAIL_AUTOCONFIRM", "true");
    expect((await POST(request("private-test-code"))).status).toBe(503);
    expect(mocks.adminInviteUserByEmail).not.toHaveBeenCalled();
  });

  it("emails only after a valid beta code; never confirms or signs in before proof of email ownership", async () => {
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, needsConfirmation: true });
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.adminInviteUserByEmail).toHaveBeenCalledExactlyOnceWith(
      "teacher@example.test", {
        data: { display_name: "Beta Teacher", timezone: "Asia/Jerusalem" },
        redirectTo: expect.stringContaining("/login?auth_notice=verified"),
      }
    );
    expect(mocks.adminUpdateUserById).toHaveBeenCalledExactlyOnceWith(
      "verified-beta-invitee", { password: "ValidPassword123!" }
    );
    expect(mocks.ensureTeacherForAuthUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "verified-beta-invitee" })
    );
  });

  it("uses verified Hebrew/Russian signup locale in GoTrue SMTP invite metadata and teacher row",async()=>{
    for(const locale of ["he","ru"] as const){
      vi.clearAllMocks();
      mocks.adminInviteUserByEmail.mockResolvedValue({
        data:{user:{id:"verified-beta-invitee"}},error:null,
      });
      mocks.adminUpdateUserById.mockResolvedValue({error:null});
      mocks.checkRateLimit.mockReturnValue({ok:true});
      mocks.ensureTeacherForAuthUser.mockResolvedValue({ok:true,created:true});
      const response=await POST(request("private-test-code",locale));
      expect(response.status).toBe(200);
      expect(mocks.adminInviteUserByEmail).toHaveBeenCalledExactlyOnceWith(
        "teacher@example.test",{
          data:{display_name:"Beta Teacher",timezone:"Asia/Jerusalem",preferred_locale:locale},
          redirectTo:expect.stringContaining("/login?auth_notice=verified"),
        }
      );
      expect(mocks.ensureTeacherForAuthUser).toHaveBeenCalledWith(
        expect.anything(),expect.objectContaining({preferredLocale:locale})
      );
    }
  });

  it("rejects unsupported mail language before sending any Auth SMTP invitation",async()=>{
    for(const bad of ["fr","he-IL","../secrets",null,{}]){
      const response=await POST(request("private-test-code",bad));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("VALIDATION_ERROR");
    }
    expect(mocks.adminInviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.adminCreateUser).not.toHaveBeenCalled();
  });

  it("fails closed on rejected SMTP/invite sending without leaking existing email", async () => {
    mocks.adminInviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "Email address is already registered" },
    });
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("already registered");
    expect(mocks.adminUpdateUserById).not.toHaveBeenCalled();
    expect(mocks.ensureTeacherForAuthUser).not.toHaveBeenCalled();
  });

  it("rate-limits approved invitations before any SendPulse email is sent", async () => {
    mocks.checkRateLimit
      .mockReturnValueOnce({ ok: true }) // initial beta-code rate limit
      .mockReturnValue({ ok: false, retryAfterSec: 60 }); // invite throttle
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(429);
    expect(mocks.adminInviteUserByEmail).not.toHaveBeenCalled();
    expect(mocks.adminUpdateUserById).not.toHaveBeenCalled();
  });

  it("rolls back the unconfirmed invitation if the password cannot be installed", async () => {
    mocks.adminUpdateUserById.mockResolvedValue({
      error: { message: "Synthetic password update failure" },
    });
    const response = await POST(request("private-test-code"));
    expect(response.status).toBe(503);
    expect(mocks.adminDeleteUser).toHaveBeenCalledExactlyOnceWith("verified-beta-invitee");
    expect(mocks.ensureTeacherForAuthUser).not.toHaveBeenCalled();
  });
});
