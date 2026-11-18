# Contact migration source inventory (initial, 2026-11-18)

This is a source-reference inventory, **not** a completed cutover or live database audit.
The first P0 proposal is archived; this is the next P0 proposal.
Guardian-related references were located using the checked-in repository search.
A match may be vocabulary only; review each before removal. No live data accessed.

## Database schema and data lifecycle

14 matched files

- `scripts/audit-m4-actions-history.mjs`
- `scripts/i18n-hardcoded-baseline.json`
- `scripts/mcp-legacy-actions.mjs`
- `scripts/mcp-tool-workflow-audit.mjs`
- `scripts/mcp-website-parity.json`
- `scripts/pre1-schema-guard.mjs`
- `scripts/pre1-schema-guard.test.mjs`
- `scripts/schema-transition-fixtures.sql`
- `scripts/schema-transition-manifest.json`
- `scripts/schema-transition-preservation.sql`
- `scripts/verify-schema-transition-convergence.sh`
- `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`
- `supabase/migrations/20261117231554_family_communication_locale.sql`
- `supabase/seed.sql`

## Application routes and pages

23 matched files

- `app/(teacher)/billing/[id]/page.tsx`
- `app/(teacher)/billing/page.tsx`
- `app/(teacher)/events/[id]/page.tsx`
- `app/(teacher)/families/[id]/page.tsx`
- `app/(teacher)/families/page.tsx`
- `app/(teacher)/students/[id]/page.tsx`
- `app/(teacher)/students/page.tsx`
- `app/api/billing/invoices/[id]/pdf/route.ts`
- `app/api/cron/event-reminders/route.ts`
- `app/api/feeds/[token]/calendar/route.ts`
- `app/api/guardians/[id]/rotate-token/route.ts`
- `app/api/guardians/[id]/route.ts`
- `app/api/guardians/route.ts`
- `app/api/portal/[token]/calendar/route.ts`
- `app/api/portal/[token]/events/[id]/rsvp/route.ts`
- `app/api/students/route.ts`
- `app/api/webhooks/stripe/[teacherId]/route.ts`
- `app/global-error.tsx`
- `app/globals.css`
- `app/icon.svg`
- `app/mcp/route.ts`
- `app/offline/page.tsx`
- `app/portal/[token]/page.tsx`

## Shared services, types and MCP

59 matched files

- `lib/ai/provider.ts`
- `lib/billing.test.ts`
- `lib/billing.ts`
- `lib/calendar-feed.test.ts`
- `lib/calendar-feed.ts`
- `lib/credits.ts`
- `lib/data-transfer.test.ts`
- `lib/data-transfer.ts`
- `lib/email.test.ts`
- `lib/email.ts`
- `lib/guardians.test.ts`
- `lib/guardians.ts`
- `lib/onboarding.ts`
- `lib/payment-qr.ts`
- `lib/payments.test.ts`
- `lib/payments.ts`
- `lib/rateLimit.ts`
- `lib/schedule.ts`
- `lib/server/agent-tools.ts`
- `lib/server/api-schemas.ts`
- `lib/server/canonical-billing-source.ts`
- `lib/server/canonical-delivery-outbox.ts`
- `lib/server/canonical-session-attendance.ts`
- `lib/server/canonical-session-notes.ts`
- `lib/server/communication-locales.test.ts`
- `lib/server/communication-locales.ts`
- `lib/server/event-email.ts`
- `lib/server/families.ts`
- `lib/server/invoice-email-content.test.ts`
- `lib/server/invoice-email-content.ts`
- `lib/server/invoice-pdf-data.test.ts`
- `lib/server/invoice-pdf-data.ts`
- `lib/server/invoice-pdf.test.ts`
- `lib/server/invoice-pdf.ts`
- `lib/server/invoice-send.ts`
- `lib/server/notification-copy.test.ts`
- `lib/server/notification-copy.ts`
- `lib/server/smtp.ts`
- `lib/server/student-profile-service.test.ts`
- `lib/server/student-profile-service.ts`
- `lib/server/teacher-billing-operations.test.ts`
- `lib/server/teacher-billing-operations.ts`
- `lib/server/teacher-billing-read-service.ts`
- `lib/server/teacher-credit-service.ts`
- `lib/server/teacher-csv-export.ts`
- `lib/server/teacher-events-service.ts`
- `lib/server/teacher-guardian-service.test.ts`
- `lib/server/teacher-guardian-service.ts`
- `lib/server/teacher-import-csv.test.ts`
- `lib/server/teacher-invoice-send-preview.ts`
- `lib/server/teacher-policy-service.test.ts`
- `lib/server/teacher-policy-service.ts`
- `lib/server/teacher-spreadsheet-import.ts`
- `lib/server/teacher-transfer-service.ts`
- `lib/server/token-guard.ts`
- `lib/spreadsheet-import.test.ts`
- `lib/spreadsheet-import.ts`
- `lib/supabase/types.ts`
- `lib/token.ts`

## Teacher UI and translations

17 matched files

- `components/brand/AppLoadingScreen.tsx`
- `components/teacher/AddStudentForm.tsx`
- `components/teacher/FamiliesManager.tsx`
- `components/teacher/FamilyDetailActions.tsx`
- `components/teacher/FamilyForm.tsx`
- `components/teacher/StudentLessonNotes.tsx`
- `components/teacher/billing/BillingList.tsx`
- `components/teacher/billing/CreditPackagesCard.tsx`
- `components/teacher/billing/InvoiceDetailClient.tsx`
- `components/teacher/billing/InvoiceList.tsx`
- `components/teacher/events/EventDetailClient.tsx`
- `components/teacher/schedule/CanonicalScheduleBoard.tsx`
- `components/teacher/settings/NotificationSettingsForm.tsx`
- `components/teacher/settings/SpreadsheetImportSettings.tsx`
- `i18n/messages/en.json`
- `i18n/messages/he.json`
- `i18n/messages/ru.json`

## Automated browser coverage

52 matched files

- `e2e/agent-mcp.spec.ts`
- `e2e/canonical-attendance-audit.spec.ts`
- `e2e/canonical-attendance-reacceptance.spec.ts`
- `e2e/canonical-backup-history.spec.ts`
- `e2e/canonical-cross-tenant-calendar-parity.spec.ts`
- `e2e/canonical-finance-ledger.spec.ts`
- `e2e/canonical-finance-website-mcp.spec.ts`
- `e2e/canonical-makeup-credits-parity.spec.ts`
- `e2e/canonical-notification-outbox.spec.ts`
- `e2e/canonical-outbox-authorization.spec.ts`
- `e2e/canonical-portal-cancellation.spec.ts`
- `e2e/canonical-private-sessions-parity.spec.ts`
- `e2e/canonical-recurring-slots-parity.spec.ts`
- `e2e/canonical-session-attendance-parity.spec.ts`
- `e2e/canonical-slot-financial-history-parity.spec.ts`
- `e2e/coaching.spec.ts`
- `e2e/guardian-atomic.spec.ts`
- `e2e/guardian-delete-race.spec.ts`
- `e2e/helpers/auth.ts`
- `e2e/parity-accounting-export.spec.ts`
- `e2e/parity-billing-concurrency.spec.ts`
- `e2e/parity-billing-finance-receipts.spec.ts`
- `e2e/parity-billing-lifecycle.spec.ts`
- `e2e/parity-bulk-preview-race.spec.ts`
- `e2e/parity-configured-stripe-race.spec.ts`
- `e2e/parity-configured-stripe.spec.ts`
- `e2e/parity-credits-lifecycle.spec.ts`
- `e2e/parity-event-email-delivery.spec.ts`
- `e2e/parity-event-preview.spec.ts`
- `e2e/parity-families-events.spec.ts`
- `e2e/parity-import-atomic.spec.ts`
- `e2e/parity-invoice-bulk-send.spec.ts`
- `e2e/parity-invoice-draft.spec.ts`
- `e2e/parity-invoice-generation-rates.spec.ts`
- `e2e/parity-invoice-list.spec.ts`
- `e2e/parity-invoice-pdf-pages.spec.ts`
- `e2e/parity-invoice-send-preview.spec.ts`
- `e2e/parity-invoice-send-race.spec.ts`
- `e2e/parity-long-running-receipts.spec.ts`
- `e2e/parity-notification-locale.spec.ts`
- `e2e/parity-payment-pdf-ledger-preflight.spec.ts`
- `e2e/parity-policy.spec.ts`
- `e2e/parity-portal-rsvp.spec.ts`
- `e2e/parity-student-teaching-memory.spec.ts`
- `e2e/parity-students.spec.ts`
- `e2e/parity-teacher-export.spec.ts`
- `e2e/parity-teacher-locale.spec.ts`
- `e2e/parity-tool-security.spec.ts`
- `e2e/rls-isolation.spec.ts`
- `e2e/smoke.spec.ts`
- `e2e/spreadsheet-atomic.spec.ts`
- `e2e/student-family-atomic.spec.ts`

## Other source and static assets

Potentially relevant; verify content before renaming.

- `.env.example`
- `AGENTS.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `public/auth-email-templates/confirmation.html`
- `public/auth-email-templates/email_change.html`
- `public/auth-email-templates/invite.html`
- `public/auth-email-templates/magic_link.html`
- `public/auth-email-templates/reauthentication.html`
- `public/auth-email-templates/recovery.html`
- `public/icon/chesscoachpal.svg`
- `public/sw.js`

## Explicit cutover checkpoints

- Review guardian primary/secondary identity, locales, communication recipients and tokens.
- Preserve student-to-contact, invoice debtor, credit, event RSVP, outbox and payment links.
- Review all website routes, MCP tool declarations, delegated scopes and parity registry.
- Align import/export, backup/restore, Auth and Storage with a canonical fresh baseline.
- Introduce a separately reviewed forward migration; no production run before operator approval.
- Keep contact membership distinct from portal grants, billing authority and lesson/workplace access.
- Confirm synthetic historical-data preservation, foreign-tenant RLS, retries and duplicate detection.
- Run the entire required workflow matrix on PR head and merged main before archiving.
