# Beta email verification with SendPulse

**Status:** Opt-in until an actual SendPulse delivery and exact-head E2E acceptance
are confirmed. Do not change login behavior by only toggling GoTrue.

The live private beta uses the existing Coolify Compose application on
chesscoachpal.com and api.chesscoachpal.com. Supabase Auth uses SMTP under its
own service, with AUTH_SMTP_* values managed by Coolify. Never put the SMTP
password in GitHub, the Next.js app service or a chat.

## Safety invariant

- Public GoTrue signup stays disabled (DISABLE_SIGNUP=true).
- A correct server-only BETA_ACCESS_CODE must be validated before an admin
  user invitation is issued. Both incorrect-code and approved-invite attempts
  are rate-limited; invalid and existing addresses return generic failures.
- Verified beta mode is BETA_EMAIL_VERIFICATION_ENABLED=true **and**
  ENABLE_EMAIL_AUTOCONFIRM=false. If the two flags disagree, registration fails
  closed instead of issuing a bypassed verified account.
- A signed-in teacher record is provisioned for the invitee, but no session
  is issued by signup. The teacher must click the single-use GoTrue invite
  email, return to login, and sign in with the password entered at registration.
  The stored password is set through the service-role API without marking the
  email as confirmed.
- Existing confirmed accounts stay confirmed; new accounts cannot sign in
  without proving control of their inbox. No other public signup, OTP account
  creation or password-reset endpoint is allowed to create a new teacher.
- Lost or expired invitation links should be handled by support during the
  invitation-only beta. Do not delete an existing account automatically on
  an unverified resend request.

## Activation sequence

1. Verify chesscoachpal.com DKIM, SPF and DMARC inside SendPulse and activate
   no-reply@chesscoachpal.com as a sender.
2. In Coolify, set AUTH_SMTP_PASS on the existing live resource. Keep the
   password out of any application build log. Apply it to the Auth container.
3. Send a real email (e.g. one password-recovery email to the account owner)
   and confirm SMTP acceptance and receipt. Do not interpret an HTTP 200
   alone as proof of delivery.
4. Deploy a release containing the invitation-only email-confirmation flow
   and full synthetic tests, with BETA_EMAIL_VERIFICATION_ENABLED=false and
   ENABLE_EMAIL_AUTOCONFIRM=true initially.
5. Once mail delivery and the new release are both accepted, set both flags
   atomically to true/false respectively, redeploy the same Coolify resource.
6. Verify invalid code 403, direct GoTrue signup/OTP 422, valid-code invite
   sends an email, login denied before activation, invite link activates,
   password login succeeds afterwards, waitlist persists, and unauthorized
   MCP remains 401. Clean up synthetic records.
7. Keep the private-beta code gate active; do not make signup public. SMTP
   template branding and the OAuth authorization-page redesign are deferred.

The safe rollback is to set BETA_EMAIL_VERIFICATION_ENABLED=false and
ENABLE_EMAIL_AUTOCONFIRM=true **together**, reverting only the new enrollment
mode. Do not reset a live Supabase database, revert users' verified status,
delete existing students, or expose the legacy beta domain.
