# MCP + Supabase reliability playbook (pre-v1)

**Audience:** ChessCoachPal maintainers, coding agents, and maintainers of **other** MCP-first, multi-tenant Supabase projects.  
**Status:** Recorded engineering lessons from the 2026-11-15 Claude Desktop integration exercise and PR #81.  
**Project policy:** [ADR-0001](adr/0001-pre1-breaking-changes.md), [ADR-0003](adr/0003-mcp-website-business-parity.md), [ADR-0007](adr/0007-mcp-supabase-contract-and-release-evidence.md).

> This is a reusable engineering checklist, **not** a promise that every tool, provider, tenant or release is perfect. Always verify the active commit, installed schema, authorization and actual client behavior.

## 1. The four layers are different things

| Layer | What to check | What it does **not** prove |
| --- | --- | --- |
| **Database/storage** | Tables, columns, RLS, grants, triggers, RPC behavior, migration ledger and persisted rows | That API routes or MCP operations expose them |
| **Shared application core** | Typed schema, validation, owner-scoped domain operation, retries, report aggregation | That the MCP dispatcher forwards every field |
| **MCP server** | Exact tool name, root input JSON Schema, `tools/list`, scope, dispatcher, `tools/call` and read-back | That Claude/ChatGPT defer or search for the tool successfully |
| **Actual AI client** | Connector authorization, read/write visibility, deferred ToolSearch by exact name, tool invocation and subsequent reads | Cross-client interoperability or the behavior of future cached sessions |

**Do not confuse counts with availability.** In this live exercise Claude connector settings displayed 88 read-only + 95 write tools (183). An earlier *conversation's* deferred ToolSearch nevertheless could not load `ccp_learning_materials_create`. The 183 tools were registered; the relevant creator was not discoverable in that session. Later, after PR #79's core-schema correction and a new Claude session, both `ccp_learning_materials_create` and `ccp_learning_materials_get` loaded and the write/read cycle passed.

**Rule:** A passing `tools/list`, green CI, or a connector settings count is not proof that a real client can find and call a particular tool.

## 2. Tool discovery and JSON Schema: what broke

- **Observed symptom:** an exact deferred ToolSearch for `ccp_learning_materials_create` returned no matching tool, while settings showed it enabled.
- **Correction:** PR #79 defined **one Claude-discoverable, canonical root-object input schema** for material create/update, with strict kind-specific nested validation; it removed the temporary MCP schema adapter rather than maintaining dual representations.
- **Do:** derive the MCP advertised schema, MCP dispatcher validation and website handler from the **same** typed contract. Keep the root schema compatible with the target clients' discovery/indexing. Use stable `ccp_<domain>_<action>` tool names ([ADR-0006](adr/0006-unversioned-mcp-tool-names.md)).
- **Don't:** add a second MCP-only compatibility schema that drifts from core, silently omit an input in dispatch, interpret a narrow/deferred tool search as the whole catalogue, or claim that a client cache is the cause without reproducing it.
- **Reproduce:** compare live `tools/list`, exact-name search, selected tool schema, and `tools/call` in a **new** actual client conversation. Record the returned ID, then read it through an independent operation. If the old conversation differs, describe that as a client-session observation, not a database defect.

**Critical E2E regression from PR #81:** `assessedOn` was accepted by the advertised MCP schema and by the shared skill-assessment service, but the MCP dispatch case initially failed to pass it. The call succeeded while saving **today's** date rather than the teacher's requested historical date. A full browser/delegated MCP test caught this. **A valid schema does not imply a correctly wired tool.** Test non-default field values at every boundary.

## 3. One logical record, multiple human-readable names

A full student name and a short alias may both resolve to the same stable student UUID. This is **not** duplicate creation in the database.

- **Lookup request:** return each input's resolution and the common UUID; report `matchedStudentIds` separately from commit-ready `studentIds`.
- **Lesson roster:** passing *both* names as separate prospective attendees must refuse `canCommit` with `DUPLICATE_STUDENT`, because one learner cannot be counted twice. The error must say **duplicate roster references to one learner, not duplicate student records**.
- **True ambiguity:** if an alias is shared by two different active students, require UUID disambiguation; do not fuzzy-match, guess transliterations, or auto-select from first-page search results.
- **Tests:** name-only, alias-only, name+alias in one lookup, shared alias across students, archived student, foreign tenant, large paginated roster, and no double attendance/invoicing.

## 4. Data semantics that caused integration surprises

| Live finding | Correct contract and regression test |
| --- | --- |
| Progress report `lichessRating:null` / `chessRatings:{}` despite two Lichess rapid snapshots | Report the newest snapshot **per provider/time control**, its observation date/source and a fallback latest-rapid display scalar *only when the teacher's profile value is absent*. Preserve manually entered profile ratings and **never** map platform ratings onto teacher-assessed strength (1–10). Verify website/MCP reports from stored snapshots, not only direct profile fields. |
| Skills report showed only latest grade, not trend | Include dated per-skill observations in a bounded trend; distinguish grade (1–5) from teacher strength (1–10) and external platform ratings. Never silently truncate historic observations. |
| Skill write had no date parameter | Optional coach-local `assessedOn` can reflect past observations; reject impossible/future dates. A supplied value must survive MCP dispatch, service, SQL, receipt, website and report. Repeated idempotency keys should replay the **original** observation, including across local midnight. |
| Student-filtered history echoed `Asia/Hebron`, workplace-filtered history echoed `UTC` | Distinguish selected **filter fallback timezone** (studio policy or workplace), each session's persisted **local timezone**, and which zones contributed dates. Same lesson rows can legitimately appear under both filters without silently changing local-date calculations. Verify DST gaps/folds. |
| Private lesson without duration defaulted to 30 minutes | State the default in the tool description and return the actual persisted duration. Encourage explicit `durationMinutes` (15–480); a make-up may inherit the original duration. Do not infer teacher intent from omitted fields. |
| Completion call changed shared session note from v2 to v3 | `lessonNote`, when supplied to completion, **replaces** the session note. If omitted, preserve current note. Session notes are separate from per-participant shared/private notes. Avoid hidden overwrites and test both cases. |
| `ccp_session_notes_list` was empty before a participant note was saved | The canonical session has its own shared `lesson_note`; `session_notes` stores participant notes. Document and test separate reads. |
| Material links were created but not independently read back in Claude | Read `ccp_material_links_list` separately for student and session. Each link references either a student **or** a session; two independent links are intentional. On 2026-11-15, SQL read-back verified both stored IDs and their targets; PR #81 adds a browser↔MCP regression. |
| Synthetic `assigned` evidence was voided | Audit history with `includeVoided:true` must preserve the void timestamp/reason, while current progress/aggregate with `includeVoided:false` must exclude it. A void is **not** a delete. `taught` is not automatically `mastered` or `completed`. |
| Material catalog was initially empty | A history operation needs an existing owned catalog item. Exercise catalog creation/read first, then links, evidence, void, and aggregates. A `NOT_FOUND` on invented IDs is a **pass** of the negative authorization test, not a missing table. |

## 5. Supabase canonical schema and safe resets

**ChessCoachPal-specific, pre-v1 binding rule:** exactly one fresh-install SQL baseline, `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`. Do not add incremental SQL migrations, backfill chains, legacy views, dual writes, API compatibility adapters or CogNote schema bridges to support an obsolete pre-v1 database. Update the baseline **in place**, validate a second empty installation, and decide explicitly whether an existing disposable instance needs a reset.

**The November 2026 failure:** the existing hosted test database was older than the source: `students` lacked `strength`, `name_aliases`, chess ratings/usernames, and history tables. The MCP profile tool appeared broken (`DATABASE_ERROR`) because the **physical database schema**, not the tool's profile validation, was stale. A transactionally rebuilt canonical schema fixed the missing fields. The authenticated update `strength=5`, `name_aliases=['MCP Test']` then succeeded and read back correctly; Claude independently confirmed it.

**Supabase internals are not application tables.** In a destructive reset:
1. Verify the project ID and tenant/environment, confirm **explicit** user permission, inventory and back up data, and check whether any uploads exist. Never reset production implicitly.
2. **Keep Supabase-managed** `auth`/`storage` schemas and internal metadata; don't drop them as though they were app-owned. Auth cleanup removes accounts/sessions and requires re-registration/re-authorization.
3. Do **not** directly `DELETE` from `storage.objects`/`storage.buckets`: protected Storage triggers can refuse direct SQL manipulation. Use supported Storage APIs for real objects.
4. Object-bucket policies live in `storage.objects` and survive `DROP SCHEMA public`; before replaying the current baseline on a disposable instance, explicitly handle identically named surviving policies (the November reset initially collided on `avatars_storage_*`).
5. Wrap the reset/application in one transaction when possible; inspect failures and rollback rather than retrying unconditionally. Reset `supabase_migrations.schema_migrations` to the **single** current baseline only after a successful install.
6. Read back counts, columns, triggers, policies, migration ledger, expected student/teacher state and an **authenticated** write/read rollback transaction, not just a successful SQL completion.
7. For nonbreaking DDL/security refinements on a running disposable test DB, apply an equivalent transaction **in place** and patch the canonical baseline. Don't reset merely because the project is pre-v1; this preserves valuable synthetic regression data.

**Generalizable:** Postgres schema availability, Supabase migration history and REST grants are separate concerns. Missing tables/columns require physical schema verification; a table can exist yet be inaccessible via Data API because privileges are absent; RLS determines **which rows**, not whether a role can access the table at all.

## 6. Supabase security: don't silence advisories by weakening isolation

The post-hardening readback in the disposable project confirmed:
- **Eight mutable search paths** corrected; don't use role-mutable paths for functions called by triggers or privileged RPC.
- **Eleven trigger-only `SECURITY DEFINER` functions** lost direct `PUBLIC`, `anon` and `authenticated` EXECUTE; trigger execution continues through the internal trigger mechanism.
- **63 RLS policies** were optimized in the live database with scalar `(SELECT auth.uid())` and `(SELECT current_setting(...))` initialization-plan expressions. The corresponding **single fresh-install baseline** was updated. Ownership predicates and WITH CHECK semantics must remain intact.
- **59 unindexed foreign keys** received covering indexes. Subsequently reported `unused_index` INFO is expected on a small new test database; monitor actual usage before removing important referential indexes.
- **13 intentionally server-only RLS tables have no client policies**, including OAuth secrets/grants and protected receipts: do **not** add permissive policies to make the INFO warning disappear. Ensure client roles have no grants and verify cross-tenant access denial.
- **Remaining authenticated `SECURITY DEFINER` warnings** do not automatically mean unsafe: some are deliberately owner-scoped transactional RPCs. Audit each function's grants, `auth.uid()`/tenant ownership, dynamic SQL, path, trust boundary, and regression tests. Do not revoke public business RPCs used by the website or blindly waive all security warnings.
- **Supabase Auth leaked-password protection** is a dashboard/provider setting, not an SQL schema change, and Supabase documents it as a **Pro-plan-or-higher** feature: [password-security docs](https://supabase.com/docs/guides/auth/password-security). Enable it when the active plan supports it; do not misreport it as fixed by SQL.

Security changes must have **both** a new-install baseline test **and** a live RLS/RPC permission test. Run Supabase **security and performance advisors before and after**, record warning classifications and justified exceptions. An unqualified "zero warnings" claim is false when documented intentional warnings remain.

## 7. Release and deployment acceptance — required order

1. Change shared core and typed schema; wire website, MCP catalogue **and MCP dispatch** for every new field. Don't add a parallel compatibility path.
2. Extend machine parity registry (`scripts/mcp-website-parity.json`) and independently named authenticated browser/delegated-MCP tests **in the same PR**. The PR guard intentionally blocks teacher-route changes without this evidence.
3. On a fresh synthetic installation run: TypeScript, lint, unit, canonical-schema guard, exact `tools/list` schema checks, strict parity/authorization, full E2E (including non-default persisted values and cross-client replay), Docker/Compose, backup/restore and security/history scan. **Do not merge on green compile alone.**
4. Diagnose CI failures by job and step/log. In PR #81, failures exposed a missing parity-registry update, accidental escaped newline in TS, then the missing MCP dispatch argument. Fix the **actual contract** and rerun all gates. Don't edit a test merely to hide a real mismatch.
5. Only after **all** required PR checks pass, merge; ensure no unrelated main changes are lost; check merged-main CI as applicable. Verify production Vercel deployment targets the **merged SHA**, reaches READY, and has the desired hostname alias. A ready build is not proof of HTTP endpoint or client-tool behavior.
6. Test the actual Claude Desktop and ChatGPT clients separately, if supported: new conversation, connector scopes, exact-name discovery, create, read-back, update/revision, retry, revoke; don't confuse one client's success with universal interoperability.
7. Preserve synthetic test data unless explicitly asked to reset; verify test records separately from live teacher records, and never include children's identifiers, secrets or private prompts in PR/CI logs.

## 8. Reviewer / agent checklist (portable to other projects)

- [ ] Is the claimed bug at the DB, shared service, MCP registry/dispatcher, OAuth, or **specific client** layer?
- [ ] Do both adapters call the same owner-scoped operation with **all** intended fields, defaults, null-clears and dates?
- [ ] Does a real client discover and execute the exact live tool, not just see it listed in connector settings?
- [ ] Did an independent read prove persistence and revision, and did a deliberate replay preserve the same record?
- [ ] Were two names to one identity distinguished from two actual identities? Are ambiguous names fail-closed?
- [ ] Are display ratings, dated assessment trends, audit history and active/voided counts consistent but not conflated?
- [ ] Do policy/index/function changes preserve explicit tenant isolation and trigger operation? Did advisors improve without broadening privilege?
- [ ] Does a fresh install from one baseline work? Is a reset actually needed and explicitly approved?
- [ ] Are **same-PR** registry + delegated website/MCP E2E evidence and all release workflows green?
- [ ] Is deployment at the expected immutable commit, with live-client verification clearly separated from automated checks?

**Evidence trail:** PR [#79](https://github.com/itshak/ChessCoachPal/pull/79) (Claude discovery/root schema), PR [#81](https://github.com/itshak/ChessCoachPal/pull/81) (integration rough edges/security), and the [MCP parity ADR](adr/0003-mcp-website-business-parity.md). Client observations were supplied by the maintainer from Claude Desktop and verified independently where possible; they do not constitute a ChatGPT-client test.
