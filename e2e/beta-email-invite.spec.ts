import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mailpitMessagesTo } from "./helpers/mailpit";

/**
 * Independently exercises GoTrue admin invitation SMTP against CI Mailpit.
 * The web signup's access-code and no-session gates are covered by
 * beta-signup-route.test.ts; real SendPulse delivery is a separate live gate.
 */
test("BETA: GoTrue admin invitation emits one transactional email", async ({ request }) => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const email = "beta-invite-synthetic-" + randomUUID() + "@example.com";
  const password = "SyntheticInvitePassword123!";
  const result = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: "Synthetic Chess Coach" },
    redirectTo: "http://localhost:3000/login?message=Email%20verified.",
  });
  expect(result.error, result.error?.message).toBeNull();
  const userId = result.data.user?.id;
  expect(userId).toBeTruthy();

  try {
    const updated = await admin.auth.admin.updateUserById(userId!, { password });
    expect(updated.error).toBeNull();
    await expect.poll(async () => (await mailpitMessagesTo(request, email)).length, {
      timeout: 10000,
    }).toBe(1);
    const messages = await mailpitMessagesTo(request, email);
    expect(messages[0].Subject.toLowerCase()).toContain("invit");

    const readback = await admin.auth.admin.getUserById(userId!);
    expect(readback.error).toBeNull();
    expect(readback.data.user?.email).toBe(email);
  } finally {
    expect((await admin.auth.admin.deleteUser(userId!)).error).toBeNull();
  }
});
