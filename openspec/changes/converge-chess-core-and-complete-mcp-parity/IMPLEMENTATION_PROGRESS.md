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
