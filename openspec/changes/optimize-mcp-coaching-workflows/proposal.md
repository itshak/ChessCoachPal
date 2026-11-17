# Change: optimize-mcp-coaching-workflows

- **Status:** Proposed — NOT implemented or accepted.
- **Date:** 2026-11-17
- **Owner:** ChessCoachPal agent-first product/MCP.
- **Intent:** Make real chess-coach tasks reliable and economical for AI agents, without removing any teacher business capability from the existing single authenticated `/mcp` connector.
- **Existing contracts:** [ADR-0003](../../../docs/adr/0003-mcp-website-business-parity.md), [ADR-0006](../../../docs/adr/0006-unversioned-mcp-tool-names.md), [ADR-0007](../../../docs/adr/0007-mcp-supabase-contract-and-release-evidence.md), [applied parity spec](../../specs/teacher-mcp-parity/spec.md), [strict route/behavior registry](../../../scripts/mcp-website-parity.json), [real-client runbook](../../../docs/AI_AGENTS.md).
- **Source baseline:** Review the **current main** tool definitions in `lib/server/agent-tools.ts`, actual `tools/list`, dispatchers, shared domain services and tests. On 2026-11-15 one real Claude setup showed 88 read + 95 write tools; **183 is an observation, not an approved or fixed tool count**. Some high-level workflows already exist (including lesson capture, combined lesson/chapter commit and coach briefings). Do not duplicate them.
- **PR #95 incorporated (merged on 2026-11-17):** [#95](https://github.com/itshak/ChessCoachPal/pull/95), merge `f2254f6ce74872f77984aaea11479b8e8abe4fab`, introduced **already implemented** source-neutral historical date-list `ccp_historical_attendance_dates_preview`/`_commit` (one workplace, per-student observed ISO dates, reviewed idempotent write), advanced mapped-import separation, and `ccp_settings_export_csv` (table catalog + bounded per-table pages; full CSV ZIP on website; JSON retains the restore contract). It raised bounded MCP JSON-RPC request framing to **320 KiB** for up to **250 observations/256 KiB** of direct import data, synchronized server version reporting and introduced `initialize.instructions`. These are **baseline implementations to audit and preserve**, not new deliverables for this change. PR #95's referenced synthetic acceptance runs do not certify all real ChatGPT/Claude clients or substitute for current merged-main gates.
- **Dependencies:** Preserve the accepted 2026-11-14 website↔MCP parity baseline (59 teacher route families, 93 original + 26 added scenarios) and all later changes. Development implementation must pass current strict merged-main gates. Do not change production connection, publish a release, or assume real ChatGPT/Claude interoperability from this proposal alone.

## Why

ChessCoachPal is an **MCP-first application**, not a website product with a limited agent addon. Today a teacher should be able to accomplish the same ordinary business task from ChatGPT/Claude or from the website. Merely mirroring every internal API as a separate MCP tool, however, can force an agent to discover, sequence, interpret and verify too many low-level calls.

The product's promised value is a dependable coaching workflow: a teacher can say “Yesterday I taught Daniel and Michael for 90 minutes; we covered Lucena, Daniel needs practice,” and receive correctly linked session, attendance and student-specific evidence without having to orchestrate a database. Likewise, “We studied a new endgame position” should not necessarily require the model to separately create a material, locate a student, attach the material to a session, write an observation and verify five independent effects.

A broad 183-tool inventory is **not proof** of poor design: several existing operations are already workflow-oriented; full teacher control legitimately needs granular operations. Optimize **task composition, discovery descriptions, schema consistency and meaningful response receipts**, not a superficial tool-count target.

Research and vendor guidance favor user-goal-oriented tool definitions and progressive discovery where clients support it:
- [OpenAI: design plugin tools around user workflows](https://developers.openai.com/plugins/plan/tools).
- [OpenAI: plugin tool accuracy and reviewability](https://developers.openai.com/plugins/plugin-guidelines).
- [MCP tools protocol](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) (verify the negotiated protocol version during implementation).

## Decisions this change proposes

1. **Preserve full website/MCP business parity, without exception for “too many tools.”** The website must remain optional for reading, editing and correcting business data. Only credential entry, MFA, protected card/hosted checkout and other documented sensitive actions may use narrow secure-browser handoffs. No ordinary student, material, report, group, lesson or finance information becomes web-only.
2. **One connector and endpoint by default.** Keep `/mcp`. Do not make users install multiple department MCPs or a separate skill to reach essential functionality. Do not add a generic `execute_anything` or hidden raw-SQL dispatcher.
3. **Optimize for coach intents before API resources.** Define concrete task journeys; map existing tools/services; reuse and consolidate where appropriate; add a small number of high-value composite domain operations, **only** where they demonstrably eliminate unnecessary model orchestration.
4. **Retain fine-grained capabilities.** Creating/editing a single material, student field, session participant, invoice or schedule rule must remain directly possible for authorized clients. Where a composite covers a whole task, granular operations are still necessary for one-off edits, corrections and advanced users.
5. **Put deterministic coordination in the backend.** Identity resolution, schedule selection, teaching-time dedupe, linked material creation/association, evidence/provenance, authorization, transactionality, revision checks, replay receipts and independent read-back belong to shared owner-scoped services—not long instructions telling the model to guess a sequence.
6. **Use native client progressive discovery when supported.** Ensure precise user-oriented names/descriptions and root-object JSON schemas. Do not assume the server can “prioritize” tools in model context through portable MCP metadata; tool selection is host-dependent. Avoid inventing a custom semantic router before a concrete interoperability need exists.
7. **Apply least privilege, not arbitrary Free/Pro hiding.** Tool-list exposure may reflect stable authenticated scopes/capabilities, but actual permissions and entitlement rules always run on `tools/call`. Subscription plan, OAuth scope and client cache are distinct concerns; subscription management remains available on Free as appropriate.
8. **No paid-token benchmark gate for this proposal.** Use established best practices and existing synthetic CI. Implementation must include deterministic workflow acceptance, static catalog quality checks and cross-interface parity; real ChatGPT/Claude sign-off remains a separate client-specific release concern, not an automated subscription/API-token dependency.

## In-scope deliverables

- A **PR #95 workflow disposition** covering the implemented quick historical dates preview/commit, advanced mapped attendance import, distinct student/family spreadsheet onboarding, portable redacted CSV catalog/pages versus website ZIP, and JSON restore. Verify selection guidance, tenant/privacy bounds, stable pagination, tool description size and framing limits before proposing replacements.
- A reproducible **current-catalog inventory** (tool name, action, domain, scopes, read/write, descriptions, schema complexity, shared service, route mapping, current evidence and overlapping functionality).
- A **workflow-to-tool/service matrix** for major teacher intents; prioritize normal lesson capture, group attendance/notes, material creation+use, individual progress/briefing, identity resolution, lesson correction, scheduling, assignments, reporting, archival, import/export, communications and guarded financial tasks.
- An explicit **audit of workflow composition gaps**. Mark each as *reuse existing*, *refine tool*, *new composite*, *keep granular*, *retire redundant pre-v1 alias*, or *defer*; justify security and parity implications before making code changes.
- Focused, accurate, stable `ccp_<domain>_<action>` names and descriptions: when to use, what they do, whether they mutate, required approval, semantic limitations and no overlapping misleading descriptions. Keep the canonical website+MCP typed contracts in sync.
- Where warranted, high-level **preview → confirm/commit → receipt** workflows with an atomic backend where possible; typed granular escape hatches remain independently callable.
- Measurable **synthetic** CI and browser↔MCP acceptance for complete tasks and all changed field paths, alongside required strict parity, auth/tenant, security, schema, Compose and restore checks.
- Updated technical docs, MCP catalog, workflow recipes and a binding ADR **after** the design is implemented and accepted; record actual test evidence, not promises.

## User-goal shortlist to inspect first

1. **Capture completed private/group lesson:** resolve student aliases, scheduled or explicit time, attendance, per-student notes, teacher time once; preserve correct timezone and single canonical session.
2. **Record a lesson that introduces a new material:** create or resolve the material, attach it to the session/students and record *taught/assigned* evidence without assuming mastery; ideally one coherent preview and one committed transaction.
3. **Correct existing lesson/attendance/material evidence:** identify affected records, preview impacts, apply scoped revision-safe correction and preserve history.
4. **Prepare next lesson:** one evidence-backed read combining attendance, known materials, teacher observations and review candidates, distinguishing fact from suggestion.
5. **Manage roster:** search/resolve, edit profile/alias/strength, archive/reactivate safely, bulk roster changes when explicitly requested.
6. **Manage schedule and groups:** weekly slot, occurrence exceptions and multi-participant attendance without inconsistent parallel models.
7. **Assign/review training:** create or reuse study/chapter/puzzle references, attach assignment and track explicitly evidenced status.
8. **Review coaching business:** workplace summary or student report/export; billing/payments/communications must preserve preview/confirmation and external-side-effect safety.
9. **Import actual historical attendance dates:** recognize verified dated presence evidence from an external document, select one verified workplace, use the existing quick date-list preview/commit for unambiguous dates; reserve the existing advanced mapped path for absences/aggregates/mixed sources, never fabricate ordinary sessions or instructor duration.
10. **Export teacher-owned data:** explicitly requested full CSV data export uses existing per-table catalog and bounded pages via MCP, or browser ZIP; keep complete JSON as the restorable backup format and never ingest entire export into the model context for routine teaching queries.

These are **candidates for analysis**, not automatic commitments to eight new tools. Existing tool names, implementations and transactions must be checked before proposing replacements.

## Non-goals

- No reduction of website↔MCP parity, no removal of standard record-level editing and no second required MCP installation.
- No forced “12 tools only” cap; no promise that all hosts defer unselected definitions.
- No arbitrary operation dispatcher, dynamic tool list mutated by prior tool calls, agent-scripted SQL, credentials exposed through chat, or model-owned transaction logic.
- No premature OpenAI/Anthropic-specific skill dependency or paid model benchmark harness.
- No unrelated UI redesign, subscription re-packaging, payment-processor migration, database reset or new chessboard/live-classroom product.
- No backward-compatibility scaffolding with CogNote or old pre-1.0 ChessCoachPal APIs (ADR-0001); **never** remove current authorized capabilities or skip documentation/acceptance for tool renames.
- No private pricing, confidential strategy or individual customer records in this public source repository.

## Acceptance and archival boundary

A completed *implementation* must also preserve PR #95's date-list vs advanced import semantics, privacy-filtered/paginated export and accurate transport/tool-discovery guidance. A completed *implementation* must demonstrate (a) a current full tool/intent inventory and deliberate disposition of every tool, (b) several representative teacher tasks completed with backend-owned coordination and **bounded** model-side calls, (c) every granular business operation and existing parity scenario still available, (d) exact-field website/MCP read-back and full tenant/security/replay tests, and (e) passing required checks on the exact merged-main SHA. This **proposal commit does none of those things**. The change stays active and unchecked until implemented and verified. Do not archive on the strength of this document alone.
