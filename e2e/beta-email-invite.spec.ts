import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mailpitMessagesTo } from "./helpers/mailpit";

/**
 * Independently exercises GoTrue admin invitation SMTP against CI Mailpit.
 * The web signup's access-code and no-session gates are covered by
 * beta-signup-route.test.ts; real SendPulse delivery is a separate live gate.
 */
test("BETA: GoTrue admin invitation renders EN, HE and RU transactional emails", async ({ request }) => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  for(const [locale,expectedCopy] of [
    ["he","ברוכים הבאים"],
    ["ru","Добро пожаловать"],
    ["en","Welcome to ChessCoachPal"],
  ] as const){
  const email = "beta-invite-synthetic-" + randomUUID() + "@example.com";
  const password = "SyntheticInvitePassword123!";
  const result = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: "Synthetic Chess Coach", preferred_locale: locale },
    redirectTo: "http://localhost:3000/login?auth_notice=verified",
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
    const full = await request.get(`http://127.0.0.1:54324/api/v1/message/${messages[0].ID}`);
    expect(full.status(),await full.text()).toBe(200);
    const rendered=await full.json() as {HTML?:string;Text?:string};
    expect(rendered.HTML).toContain(`lang="${locale}"`);
    expect(rendered.HTML).toContain(`dir="${locale==="he"?"rtl":"ltr"}"`);
    expect(rendered.HTML).toContain(expectedCopy);

    const readback = await admin.auth.admin.getUserById(userId!);
    expect(readback.error).toBeNull();
    expect(readback.data.user?.email).toBe(email);
  } finally {
    expect((await admin.auth.admin.deleteUser(userId!)).error).toBeNull();
  }
  }
});
