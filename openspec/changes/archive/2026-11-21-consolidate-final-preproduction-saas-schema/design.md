# Design: final target schema and no-competing-DDL ownership

**Status:** Proposed field contracts for schema implementation. Names are candidate canonical names until SQL/type review; this design is not a claim the tables exist. See [full domain crosswalk](../../../../docs/FINAL_SCHEMA_REQUIREMENTS_CROSSWALK_2026-11-21.md) and ADR-0019.

## Canonical implementation strategy

Keep one target `supabase/migrations/20261107000000_chesscoachpal_baseline.sql` for pre-v1 fresh installs; fold all approved changes into it and regenerate the manifest/types. Do not stack new `supabase/migrations/*` files, create app-to-database dual writers or assume a simple `db push` can migrate populated data. Names retained below are illustrative until the field-level review closes and generated types are proven. One schema owner; separate downstream behavior owners.

### A. Commercial / entitlement authority (new)

| Table | Minimum fields and invariants | Access |
| --- | --- | --- |
| `capability_definitions` | immutable stable key, `kind=boolean\|integer_limit`, unit, security classification, active/version; type-safe audited key registration | app-reviewed/admin-only writes, public non-sensitive catalogue |
| `plan_versions` | UUID, plan code, monotonically increasing version, published/effective lifecycle, immutable after use; uniqueness on (code,version) | trusted catalogue writer |
| `plan_capabilities` | plan version FK, capability key FK, exactly one typed value (boolean or nonnegative integer or explicit unlimited), unique(plan_version,key) | trusted catalogue writer |
| `teacher_entitlement_state` | teacher PK, baseline plan_version, revision, active_student_count, effective-evaluation/version marker, created/updated; no opt-out `hosted_enforced` toggle | trusted transactional RPC; owner read |
| `teacher_entitlement_grants` | UUID, teacher composite FK, kind `plan_access\|capability_boost`, optional plan_version or capability key, typed benefit, starts/expires/revoked, reason, issued_by, immutable request ID and audited precedence | privileged writer; owner redacted read |
| `entitlement_audit_events` | immutable teacher/actor/source/time/event/request/old-new effective revision, reason, no raw secrets or personal payment data | privileged append, redacted owner read |
| `account_usage_events` and `account_usage_periods` | idempotent meaningful workload unit per teacher+capability+source, time/window and used/reserved/limit; avoid raw tool invocation metering | privileged bounded workers and SQL writer; owner aggregate read |

**Merge rule:** start with active versioned Free baseline; select verified current paid plan or active whole-plan grant (deterministic precedence, operator-reviewed tie-break), then apply only **additive** individual boosts (boolean OR and numeric max; explicit unlimited wins). Grants may be permanent or expire. Do not let customer-controlled records select themselves. An individually authorized capacity override and a finite-duration plan grant may coexist with a separately valid paid subscription. This schema makes no public promise of particular cohort benefits. Any account restrictions/suspension for abuse/privacy require separately authorized security controls, never a hidden negative "founder" grant.

**Atomicity rule:** on INSERT, archive->active UPDATE, import, restore, professional workplace creation/unarchive and usage reservation, lock one tenant entitlement-state row, recompute effective version/grants at transaction time, compare counters and write once. No independent app ENV cap as authorization. Stored counters need triggers/reconciliation checks, including administrative imports and direct authenticated SQL. Quota changes do not mutate or hide existing canonical data. Active students are distinct students with `archived_at IS NULL`; group/workplace duplicates count once. Downgrade above cap means growth-blocked (not teaching-disabled), historical corrections and export remain permitted.

### B. Provider-neutral **platform subscription** (new, completely distinct from teaching invoices)

| Table | Minimum fields and invariants |
| --- | --- |
| `platform_billing_customers` | teacher, provider code, provider merchant/account scope, external customer ID, created/disabled timestamps; unique provider+merchant+external ID |
| `platform_subscription_offers` | versioned plan_version, provider, external price reference, currency and billing interval, effective dates; no hardcoded marketing price hypotheses |
| `platform_subscriptions` | teacher, provider and merchant, external subscription ID unique within provider scope, offer, state, paid-through and current-period end, cancellation/grace/retry, latest accepted event checkpoint and local revision |
| `platform_billing_events` | provider+merchant+external event ID unique, verified received timestamp, provider-object ID, event creation/version, payload digest, processing status/attempt/error, applied subscription version; redact sensitive provider payloads and handle out-of-order/replay |
| `platform_entitlement_transitions` (optional if unified audit suffices) | Prefer **reuse** `entitlement_audit_events`; do not create duplicate audit truth |

Authenticated teachers may read published-plan offer metadata, including its window; this is not sale eligibility or a price promise. Billing routing fields (`merchant_scope` and `external_price_id`) are visible only to the trusted service. A verified existing subscription is evaluated by its plan and verified paid/trial/grace state, not the offer sale window. Rating catalogue rows expose their own active flags; worker admission and commit independently require an active parent provider and supported active category.

Never elevate solely on a checkout success redirect or an unverified payment event. Signed webhooks and provider account scopes are validated by adapters. Compare/corroborate current subscription identity and ordered provider status before applying; older deletion cannot demote a replacement subscription. Explicit cancellation, period-end, failed payment, bounded grace, refund/dispute and trial states; reconcile external events after errors. Do not conflate `platform_*` money with teacher `invoices`, `payments`, `received_payments`, `credit_packages` or `financial_obligations`. OAuth scopes and portal grants remain independent of plan state.

### C. Workplaces and teacher settings

Extend existing `workplaces` (not create a second organization table) with `kind=personal\|professional`, `status` or `archived_at`, revision and validated typed policy fields where existing JSON does not provide a secure contract. Exactly one system Personal workplace per teacher, provisioned transactionally and not deletable; professional workplace count excludes groups, archived professional workplaces and the personal workspace. Allow safe editing/export of historical workplaces after downgrade, prevent new premium-only professional scope creation. Verify `teachers.selected_workplace_id` owner-FK, teacher UI `preferred_locale`, recipient-facing locale independent of UI, teacher-global versus workplace-local timezone/currency/rate policy and frozen session/obligation effective snapshot. Do not count a student separately in multiple workplaces.

### D. Students, dated membership, credits, Contacts/portal

Retain `students` canonical IDs, existing `workplace_enrollments` dated intervals and archive/reactivate preview/commit, `contacts`, `student_contacts`, `billing_accounts`, `student_billing_assignments`, `portal_access_grants` and existing teacher finance ledger. Validate period exclusions, unknown historic starts, cross-tenant composite FKs, amendments/audit, historical attribution and no implicit portal/payer creation. A credit package is a purchased teaching entitlement, **not** a platform Free/Pro grant. Preserve issued/paid invoices, credits, reversals, exact debtor and original enrollment/attendance when closing a relationship. Require digest-only portal token, explicit scoped revocation and safe public guest RLS/service bypass.

### E. Recurrence and report publication (only missing persistence)

`lesson_slots` is existing recurring *intent*; `teaching_sessions.slot_id` plus `slot_occurrence_date` is occurrence identity, while `rescheduled_from_date` and makeup references already exist. **First prove whether these fields support this/this-and-future/all-series edits.** Where genuine exceptions otherwise vanish (e.g., canceled unmateralized future occurrence), add one tenant-owned `slot_occurrence_exceptions` relation keyed by (teacher,slot,original_local_date), action, revised start/linked session, reason, revision and approved request receipt; no new independent recurrence source. Add append-only session change/approval audit only if existing `ccp_session_note_audit`, `ccp_session_attendance_audit` and correction receipts cannot preserve the needed event. Never rewrite completed lessons.

For advanced shareable progress reports, add `report_publications`: teacher, report scope student/workplace, encrypted/safe snapshot storage reference or bounded materialized payload digest, approved_at/by, revision, superseded_id, revoked_at, output locale, explicit publish request ID. Link access through existing scoped `portal_access_grants` or a narrow audited publication-grant join **only when proven necessary**; no automatic audience based on contact, group, payer or parent relationship. Draft calculation needs no table unless state survives sessions; no second reporting/grade truth.

### F. Learning, rating, durable jobs, privacy

Reuse `material_teaching_evidence` and `chess_observations`; current material `stage=assigned\|taught\|completed` is **not proof of skill proficiency**. Add typed teacher-verifiable observation status/provenance only where a demonstrated-vs-practiced/needs-review distinction cannot be represented; never automatically infer mastery. `student_rating_snapshots` must be an extensible provider-scoped rating record (provider/category/official effective date/original handle, retrieval evidence), not new FIDE rating columns per category. Introduce a reviewed typed lookup (e.g., `rating_providers` plus `rating_categories`, with stable code/version and tenant-safe snapshot references) instead of expanding the present hardcoded provider/time_control CHECK lists for every new approved federation. Reuse `student_federation_memberships`, `student_rating_snapshots` and their provenance, not a parallel evidence stream. Retain `student_federation_memberships`, `student_rating_sync_consents`, `student_rating_refresh_jobs`, `student_rating_refresh_receipts`; validate provider/schema extendability for unapproved national federations without guessing account identities. Background worker needs durable lease, consent, job revision and idempotent result with strict external request controls. Daily queue derived from existing records; reuse `ccp_delivery_outbox` for approved delivery, not a shadow generic job system. Keep privacy/erasure/retention and audit actor/source at every sensitive boundary.

### G. Cross-cutting contract and security

- Exact audited object inventory (87 physical tables at review; count must be recomputed after edits), PK, tenant-composite FKs, owner-first indexes, uniqueness, bounded JSON/array lengths, UTC instants + explicit IANA timezone and calendar-date semantics, immutable financial and historical events.
- All application-owned tables explicit RLS and appropriate service/auth/anon grants; test **effective** access and every `SECURITY DEFINER`/RPC execution permission, not only an RLS-enable grep.
- Existing `lib/supabase/types.ts` is hand-maintained and incomplete relative to physical SQL; decide internal-only vs public types, then generate verified contracts. Do not have duplicated entitlement fields and incompatible types.
- Rate limits, portal grant expiry, consent revocation and export/privacy controls are orthogonal to paid plan features; Free users can inspect/export records and correct errors.
- Staged schema feature columns may ship without user-facing behavior; label all such fields `schema_only` in the crosswalk. Never market data structures as implemented integrations.

## Downstream ownership and freeze handshake

The single consolidated P0 owns *all* remaining physical DDL. Contacts, temporal enrollment, workplace context, compensation, portal, FIDE/national, online rating sync, daily/professional workflows, multilingual and UI/MCP plans continue as independently accepted functional proposals without new planned SQL. Any new persistent need discovered during those implementations must be raised for review before freeze, not silently shipped. A schema freeze is an honest targeted commitment; future Academy, regulations or entirely new domains may need explicit post-freeze migrations.
