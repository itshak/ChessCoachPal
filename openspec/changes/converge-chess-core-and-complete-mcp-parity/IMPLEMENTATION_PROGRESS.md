# ChessCoachPal canonical-schema implementation ledger

**Status:** Draft implementation in [PR #51](https://github.com/itshak/ChessCoachPal/pull/51). The OpenSpec remains active. No release, production reset, OpenSpec archival or main-branch merge is authorized.

## Binding rule: ADR-0001

- One chess-specific **fresh-install** PostgreSQL schema in `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`.
- No incremental schema-upgrade chain, data backfill, alternate material ID mapping, dual material writes, compatibility adapter, obsolete API facade or backup-format version negotiation.
- Fresh synthetic test databases are disposable and may be explicitly recreated. Real teacher or student records must never be reset or removed without operator authorization.
- Portable exports contain the current schema alone, without a `version` property; foreign table names and unsupported top-level keys are rejected, not interpreted.
- The optional professional features (billing, guardian/contact functions, events, hosted account actions) remain supported user capabilities. Removing a compatibility mechanism **does not authorize removing a current useful feature**.

## Current-source changes

The typed `learning_materials` catalog provides teacher-scoped games, puzzles, drills, study chapters and HTTPS links. The same website/MCP services provide corrections, relations, archiving, fan-out homework, reviews, explicit goals/plans and factual lesson-preparation briefings.

The interim material mapping feature has been deleted, including its HTTP route, MCP tools, React panel, source service, SQL table and test. Material archive impact still guards live assignments and typed-material relations.

All executable SQL definitions have been assembled into one fresh-install database snapshot instead of a sequence of upgrade files. No production database was touched.

Teacher portable backups now describe only the current schema and current table allowlist. There is no `DATA_EXPORT_VERSION` check and no previous-data converter. Backup privacy rules still exclude OAuth grants, credentials and payment secrets; restore remains a single approved transaction.

## Important unresolved work

The current source still includes an independently writable resource-link and material-coverage model (`chess_learning_resources` and `chess_material_progress`). Those remaining paths must be replaced with direct typed `learning_materials` IDs and current-schema teaching-evidence records, including the website forms, MCP tools, reports and E2E tests, **before claiming the one-material-model requirement is finished**.

The current source also contains two mechanisms for completed lesson history. A single authoritative occurrence writer, current-schema recurrence/attendance and full field-level MCP parity remain open. Finance, contacts/guardians and events must retain their current supported behavior on the canonical schema. Do not mark a route complete without executed browser and authenticated delegated MCP evidence.

## Verification evidence

The last previously confirmed integrated checkpoint, `f25b360328f6b5964a26fbd1a87b08f38eb67da2`, passed [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43068237786), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43068237617), security, Compose and backup/restore. Those results preceded this schema cleanup and must NOT be represented as verification of the new tree.

The canonical-schema cleanup candidate `069ab80b3180f11f62085e3c81bebda49b821e46` passed all five workflows: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43092006651), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43092006645) (**180 passed, five intentionally skipped, zero failed**), [security history audit](https://github.com/itshak/ChessCoachPal/actions/runs/43092006736), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43092006639) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43092006657). These are synthetic current-schema tests, not final strict parity acceptance.

An ADR-0001 CI guard checks for one fresh-install SQL snapshot, absent material mapping bridge, and one unversioned backup contract. Its stricter `npm run schema:canonical:strict` mode intentionally blocks the final release until `chess_learning_resources` and the parallel material-progress writer are replaced by direct typed-material evidence. Do not label this code fully canonical merely because the non-strict CI succeeds.

Keep [PR #51](https://github.com/itshak/ChessCoachPal/pull/51) in draft while the strict parity inventory is incomplete. Updating one registry label or deleting a test is not evidence of feature parity.

## 2026-11-11 current-schema implementation increment (not parity acceptance)

- Skill-dimension creation now uses one teacher-scoped SQL transaction and an optional request UUID shared by the website and MCP, with an immutable response receipt, concurrent sort allocation and cross-interface replay/conflict checks. This corrects a concrete outstanding retry gap without importing or converting any old schema.
- Removed an unnecessary format-version field from the parity evidence inventory. Current MCP tool names remain stable during this integration; their names are not a legacy API adapter or a schema-upgrade contract.
- Added browser↔delegated MCP E2E for same-key replay, changed-payload rejection and reverse-direction creation. These new tests remain **unverified until executed on this exact commit**; do not promote the skill-dimensions route or archive the OpenSpec based on this implementation alone.

## Canonical typed material teaching-evidence increment — implementation candidate

- One fresh-install `material_teaching_evidence` ledger now references `learning_materials` by tenant-owned `material_id`. The old `chess_material_progress` ledger was removed, not migrated or dual-read.
- Teacher website and authenticated MCP use `materialId` for recording/filtering evidence. Student/workplace aggregates and the website history editor select from the typed material catalog; no legacy resource-to-material translation or backup version negotiation was added.
- The material lifecycle preview and PostgreSQL archive transaction both block archiving records with material-teaching history. Current-shape portable backup/restore includes the new ledger.
- Added revised unit/E2E fixtures covering canonical IDs, student reports, group-session deduplication, invalid material IDs, and URL reference removal without erasing independent historical evidence.
- **Still open:** eliminate the separately writable `chess_learning_resources` URL-link catalog and update the remaining website/MCP surfaces, consolidate the lesson history writer, finish all other parity gaps, run strict gates and verify on merged main. This is not an OpenSpec completion or release acceptance.

## 2026-11-11 canonical typed material associations — implementation candidate

- Deleted the redundant `chess_learning_resources` table from the one fresh-install schema snapshot, including grants, RLS, foreign keys and resource-specific indexes. New `material_links` retains only teacher, canonical `learning_materials` ID, optional student/session target, immutable request UUID, revision and timestamps. Composite FK and an insert/update trigger enforce scope, current material status, frozen session membership and archive synchronization.
- Website and MCP now share link-specific operations (`materials.links.*` and `ccp_v1_material_links_*`) for create, list, revisioned reassign, impact preview and unlink. Typed material content remains in the single catalog; old tool names and website actions were removed outright, with **no aliases or backwards compatibility**.
- The Chess Learning UI selects from the canonical catalog instead of separately creating URL records. Whole-history evidence is unaffected by link removal. Portable export and single-transaction restore include `material_links` in catalog dependency order. Catalog archive preview and database transaction both protect active associations.
- Added/replaced browser and delegated MCP tests for creation/retry, correction and stale revision, tenant ownership, student/history preservation and current-schema validation. These changes **still require successful exact-head typecheck, E2E, security and database fresh-bootstrap smoke**; none are marked accepted before CI evidence.
- Still open: second completed-lesson writer, other incomplete API route families and 93-case cross-surface acceptance. Strict parity remains blocked; PR stays draft, OpenSpec stays active.

## 2026-11-11 session completion + attendance writer consolidation — implementation candidate

- Replaced `ccp_teacher_session_patch`, the MCP-only `agent_record_attendance`, and MCP-only `agent_update_session_note` with ONE owner-verified SQL mutation entrypoint: `ccp_teacher_session_commit`. This new-schema RPC serializes the session, validates frozen-roster membership, status/note/revisions, and atomically updates session fields and any approved attendance rows. Shared website/MCP attendance and note operations now call the same service; old SQL writer functions and their grants are deleted, not aliased.
- A new `sessions.complete` website action and `ccp_v1_sessions_complete` MCP tool require one current `updatedAt` session revision, all frozen participants and each explicit attendance status + revision, one idempotency key, and confirmed approval. Any roster mismatch or stale attendance row rolls back the ENTIRE completion, including session status and receipt. The normal edit and attendance routes still use this same underlying RPC. No attendance result implies material mastery.
- Added a teacher website completion panel with an explicit status selector for each learner and an affirmative confirmation checkbox. Unit/E2E cover duplicate learners, row+session revision races, owner checks, replay and complete website↔MCP readback; evidence remains pending exact-head execution.
- **B5 is still NOT complete.** The separately writable `lessons`/`attendance` calendar model is needed by existing recurring slots, notes, make-up credits, family emails and invoicing. This change does **not** dual-write or silently reinterpret those rows, does not pretend they are canonical coaching sessions, and does not remove dependent supported business features. The next required step is an explicit clean-schema, service-by-service calendar/finance/portal cutover before deleting those tables and the cross-model history reconciliation.

### Implementation audit correction

- Maintained the **fixed 93 historical checklist case IDs** and established `docs/MCP_NEW_PARITY_SCENARIOS.md` for additional domain cases. The audit validates both matrices without treating new coverage as a replacement for an old case.
- The teacher component inventory now explicitly includes `LessonCompletionPanel`; MCP attendance uses the imported shared service rather than the deleted MCP-specific SQL writer. Exact-head E2E and CI remain release gates.
