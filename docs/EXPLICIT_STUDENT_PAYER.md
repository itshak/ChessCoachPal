# Explicit student-to-billing-account assignment (source implementation, not financial release)

**Status:** Draft PR #104. This native first layer does not create financial obligations, invoices, debt, payment, settlement or any guest portal permissions. It is not live or merged. ADR-0017 permits only one future operator-approved production cutover to a single canonical baseline.

## Contract

A student may attend lessons at several schools. For every billable student, workplace and **local calendar date** the billing engine must resolve at most one explicitly assigned Billing Account. A natural parent/guardian relationship, school enrollment, phone/email contact or scoped portal permission cannot create a payer automatically. Payer selection is teacher-approved and belongs to a student and workplace over inclusive `effective_from`/`effective_to` dates. An assigned account may be an organization or a person. One account can pay for several students, but a single participant charge has one debtor unless separately contracted sponsorship is explicitly approved in a future financial layer. Historical school/lesson attribution and previous invoices are immutable when a payer changes later.

`student_billing_assignments` is a new native tenant-owned table in the one canonical fresh-install SQL baseline; its student/workplace/billing-account composite foreign keys enforce ownership, a trigger serializes concurrent overlap checks, and the dated range avoids ambiguity for the same student at the same workplace. Create requires the student already be enrolled and an active Billing Account. Ending changes only the last effective date, preserving the historical payer. Updates are revision guarded and idempotent with a reviewed request digest. No permanent deletion is exposed. Reads and as-of-date lookup fail closed on missing or ambiguous payers.

## Website and delegated MCP

| Website | MCP equivalent | Purpose |
| --- | --- | --- |
| `GET /api/students/:id/billing-assignments` | `ccp_student_billing_assignments_list` | Read all historical payer intervals, optionally for one workplace |
| `POST /api/students/:id/billing-assignments` | `ccp_student_billing_assignments_create` | Teacher-approved one-payer effective-dated assignment |
| `PATCH /api/students/:id/billing-assignments/:assignmentId` | `ccp_student_billing_assignments_end` | Revision-guarded effective end and retained historical context |

The student detail page now includes a localized English, Hebrew and Russian editor that reads actual enrolled workplaces and existing active Billing Accounts; it explicitly states that assigning a payer is not an invoice. Synthetic authenticated website/delegated MCP acceptance in `e2e/parity-student-billing-assignments.spec.ts` covers create/read/replay, overlapping dates, payer transition, foreign student, no confirmation and readonly OAuth scope. New outbox delivery resolves approved student-linked contacts and no longer reads inherited guardians, even when the student does not have a Billing Account. Sending notes to a contact is a separate consent question from the debtor.

## Unfinished finance cutover

This establishes *who could owe a charge*, not whether a charge is billable, earned, invoiced or paid. The old guardian-based invoice generation and credit PDF/payment/Stripe workflows have **not** been rewritten to resolve these effective-dated assignments; they remain legacy blockers and must never silently fall back or assign the first contact. Requirements still open: explicit individual cancellation/sponsorship rules, immutable obligation snapshots, invoice and payment allocations, part-payments and reversals, tenant isolation, encrypted payment provider handling and independent restoration. Do not merge, archive, release or apply to a live database until the final legacy audit has zero violations and full exact SHA browser/MCP and full finance test gates pass.
