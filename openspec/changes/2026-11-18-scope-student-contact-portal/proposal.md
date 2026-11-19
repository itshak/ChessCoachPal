# Change: replace guardian-token Family Portal with optional scoped Student & Contact Portal

> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Proposed implementation; approved direction only; public access changes unimplemented.
**Priority:** P1 privacy/security cutover alongside contacts.
**Depends on:** 2026-11-18-replace-families-with-contacts and baseline-first transition; coordinate with workplace context and finance agreements.

## Why
The existing /portal/[token] is useful: shared upcoming lessons, .ics feed, cancellation, teacher-approved session notes, credits, invoices/Checkout/payment instructions, event invitations/RSVP, policy info. But its token identifies one guardian row and pulls all linked students across workplaces. The same learner might have a school contact allowed to see only school lessons and a mother allowed to see private billing. The current broad household token cannot safely express this. Teacher settings remain branded Studio.

## Outcome
Preserve useful viewer functionality but make external sharing optional, explicit, revocable and scoped to particular students, workplaces, functions and billing accounts. Retire household-wide token semantics and Family Portal naming after successful coordinated cutover. Later chess learning sharing and individual login remain independently scoped future stages.

## First delivery
- Teacher manages contact/student sharing grants; every grant has audience, student IDs, workplace scope where applicable, resource permissions (calendar, cancel, explicitly shared notes, event RSVP, invoice/credit payment views), expiry, revocation and provenance.
- External viewer accesses a scoped revocable capability link, without mandatory login for initial release. No access auto-enabled when student or contact is created or a payer is assigned.
- Portal query, calendar .ics, cancellation SQL, RSVP, event email, credits and invoice services verify the grant for each actual underlying resource, not merely on initial landing page.
- Multiple contacts for one student with different visibility; school contact cannot read private records even if the same student participates.
- Migrate existing guardians.portal_token cautiously: inventory/notify/reissue safe scoped grants after explicit teacher review; no automatic privilege widening or insecure redirect.
- Include privacy, anti-brute-force, CSRF/capability misuse, rate limits, secure token generation and storage, no caching of sensitive pages and copy-leak mitigation.

## Explicit deferrals
Independent parent/student accounts, SSO, student homework submissions, full chess training dashboard, AI assistant for minors, public student profiles and external portal MCP access. Future learning portal may share teacher-approved homework/materials/goal evidence only after a separate spec and privacy review.

## Acceptance
Teacher can grant a mother private lesson calendar and own invoices, and a school authorized person school-only event view; each sees only their permitted records. A leaked/revoked token cannot access data; child notes remain private unless explicitly shared. Teacher-side grant management has web/MCP parity, while token credentials and external sensitive actions remain on secure browser handoff.

> **Cross-change schema coordination (2026-11-19):** Existing candidate: scoped grants and revocations; acceptance pending. Guest/RLS denial and restore/reconciliation gates must pass before acceptance. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
