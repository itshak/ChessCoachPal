> **2026-11-21 schema-ownership handoff:** All remaining planned tables, columns, constraints, RLS and persisted state from this proposal belong to the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md)** (ADR-0019). This proposal remains responsible for feature services, UX, MCP parity and independent acceptance. Its earlier DDL instructions are requirements to P0, not authority for an independent migration. No live cutover is authorized.

> **Execution reconciliation (2026-11-19):** Follow [the reconciled execution sequence](../../../docs/OPENSPEC_RECONCILED_EXECUTION_SEQUENCE_2026-11-19.md). The new [temporal enrollment and credit-safe lifecycle change](../2026-11-19-temporal-enrollment-credit-safe-lifecycle/proposal.md) must be included in the canonical schema **before final freeze acceptance**. Earlier "schema freeze first" wording means governance and inventory first, not final approval before this amendment. No per-feature production migration; this proposal's feature implementation follows its stage dependencies.

# Change: introduce first-class FIDE and national federation ratings

> **Schema-first execution gate (2026-11-19):** [`2026-11-21-consolidate-final-preproduction-saas-schema`](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) is the **mandatory first implementation change**. All schema DDL, tenant/RLS/FK/index work, generated DB types and schema-induced regressions belong to that change; the reviewed schema freeze has passed; this proposal implements remaining business functionality against the locked baseline and its own dependencies. Its existing schema statements describe requirements for the foundation, **not** permission to add per-feature DDL later. Operator-only SaaS and future shard-compatible UUID/RLS design follow [ADR-0018](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md); no customer self-hosting or live cutover is authorized.


> **ADR-0017 final-cutover override (2026-11-18):** No backward compatibility or legacy dual-writes before v1. The final deliverable uses the clean canonical baseline and current website/MCP contracts. All planned features deploy with **one final** live migration **or** verified clean rebuild/reimport at the operator's choice; no per-feature production migration. Existing data handling is a deliberate one-time import/mapping decision, not an obligation to retain obsolete Family/Studio/guardian APIs or old portal tokens. Security, tenant isolation and explicit new grants remain required.


**Status:** Active: [stored/manual source and offline fixture verified](IMPLEMENTATION_PROGRESS.md); approved provider use, real automated ingestion and operator acceptance remain open.
**Priority:** P0 FIDE, P0/P1 Israeli national rating; US Chess data adapter deferred.
**Depends on:** 2026-11-18-enforce-baseline-live-transition-contract.
**Related:** 2026-11-18-automate-online-rating-sync shares immutable evidence storage.

## Why
A chess coach needs FIDE ID, separately tracked official Standard/Rapid/Blitz ratings, national registration and ratings. The current student chess profile has Lichess/Chess.com fields and snapshots limited to those two online providers. One national_rating column cannot represent US Chess Regular/Quick/Blitz or future federation-specific categories. Official ratings are evidence, not a substitute for the teacher's 1–10 strength or assessed chess skills.

## Outcome
Optional FIDE identity and national-federation memberships, teacher-configurable suggested default national federation, extensible provider/category rating observations, reliable monthly/list-based FIDE synchronization and Israeli Federation player lookup if a compliant source can be verified.

## Scope
- Add optional students.fide_id and recorded FIDE federation (distinct from a national membership), plus teacher default_national_federation_code (e.g., ISR) with student override or explicitly none.
- Add student_federation_memberships for 0..N national federations and distinct provider-scoped membership/player IDs; no assertion that default federation means verified membership.
- Generalize student_rating_snapshots provider, category, official effective_at, fetched_at, source, verification, metadata/version, idempotency, immutable history. Keep existing online provider observations intact.
- FIDE data adapter for official published rating lists, all three categories, dates, unrated/missing distinctions and schedule aligned with publication. Any retrieval uses fixed trusted endpoints, licensing/rate limits and safe bulk download/storage practices.
- Israeli Chess Federation adapter discovery/feasibility gate, verified player-ID matching and national rating source; implement automated fetch only if access method/terms are acceptable, otherwise manual source-attributed updates plus profile links and visible unsupported status.
- Website/student profile, reports, exports, ccp_* MCP read/edit/refresh, provider provenance, stale/error states, teacher consent for public minor-data lookup.

## Exclusions
Do not automatically equate FIDE or Israeli ratings with strength or mastery. US Chess/other national providers are schema-ready only, not promised first-delivery live connectors. No fuzzy guessing from names, automatic account ownership verification, FIDE login, official title inference or unverified scraping.

## Acceptance
A FIDE ID with Standard/Rapid/Blitz values remains independent of Lichess and Chess.com. Israeli player ID and national rating are stored with exact source and dates, or visibly remain unavailable if automation is unsupported. Fresh baseline and one-time real-data transition retain all existing online snapshots.

> **Cross-change schema coordination (2026-11-19):** Future schema REQUIRED: federation identities/memberships, official category/source evidence and generalized rating snapshots. Do not duplicate consent/job primitives planned for automatic online rating sync. See [`../SCHEMA_ROADMAP.md`](../SCHEMA_ROADMAP.md) for shared dependencies and ADR-0017 single-final-cutover rules. Passing the Contacts/Finance PR does not automatically accept this proposal.
