# ADR-0016: Chess-coaching identities, contexts, access and finance

- **Date:** 2026-11-18
- **Status:** Accepted product architecture — implementation pending OpenSpec changes
- **Related:** ADR-0003, ADR-0004, ADR-0005, ADR-0017

## Context

The inherited studio/guardian/family model cannot faithfully represent a student studying at both a school and privately, several parent contacts, federation-sponsored lessons, group teaching counted once, or different payers per lesson. Current `students.guardian_id`, `guardians.portal_token`, `invoices.guardian_id`, and teacher-global `studio_policies` encode those assumptions. The existing portal provides real value and must not be discarded merely because its access model is wrong.

## Decision

1. **Canonical student identity:** one teacher-owned student with preserved aliases, provenance, learning evidence and history. A student MAY be enrolled in multiple workplaces and groups, and session history retains the original workplace even if membership changes.
2. **Contacts are not families.** A student MAY have zero, one or several authorized contacts. A contact MAY relate to multiple students. Contact relationship type, communication preference, legal-guardian status and permission grants are separate from payment responsibility. Delete family-as-primary navigation and inherited terminology after capabilities are safely rehomed.
3. **Workplace and group are distinct.** A workplace is an organizational/operational/financial context (private practice, school, club, online teaching); a group is a teaching roster inside a workplace. Groups have learning schedules/attendance/materials but do not become separate workplaces or unlock workplace-level policies, compensation or global filtering. Every teacher has an implicit personal workplace. Free teachers retain functional groups; additional named workplaces are a potential hosted Pro entitlement, with prices/quotas not established in this ADR.
4. **Financial source-of-truth is lesson/agreement specific.** A student may have school-funded, personally funded and sponsored lessons. A billing account can be a person or organization and is not necessarily the learner's contact. Define unambiguous payee/payer and agreement precedence, snapshot rates and effective periods. Instructor earnings, customer obligations, invoices and received payments are distinct ledgers. A group session counts **once** for instructor teaching hours; per-participant charges are independently attributed. No split-payer UI or full accounting/payroll/tax solution is required in the initial delivery; do not invent a completed payment from a completed lesson.
5. **Teacher-level preferences are not a Studio business.** Retire studio-as-separate-entity/brand and separate global teacher defaults/credentials from per-workplace locale, timezone, policies and compensation. New UI should say Teacher/Business settings and Workplaces.
6. **Shareable portal is optional and scoped.** Preserve useful teacher-approved lesson calendar, cancellation, shared notes, relevant invoices, credits and event RSVP functions. Contact/student access is explicitly granted with subject, audience, scope and revocation; never infer viewing rights from contact linkage, payment, group or workplace membership. Child learning notes are private by default. An authorized school contact cannot gain private-lesson access merely through school membership.
7. **Chess rating sources are separate from teaching strength.** FIDE ID and Standard/Rapid/Blitz, national federation memberships and provider-specific categories are optional verified/source-attributed external measurements; teacher-assessed strength and learning mastery remain independent.

## Execution policy

Implement via separate OpenSpec changes with design/tasks/spec deltas. Before a single final cutover, existing live data must be backed up and explicitly mapped to the final schema or deliberately reimported into a clean baseline per ADR-0017. Retire rather than translate old household portal tokens: **no old token or relationship automatically conveys a new sharing grant**. Do not retain compatibility endpoints, dual writers, tables or aliases. MCP teacher-business parity, owner boundaries, legal-minor privacy and language/RTL behavior are mandatory. This ADR does not claim that the target is implemented or enable externally shareable access by itself.
