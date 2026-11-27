# Acceptance matrix — planned, not executed

| Case | Required independent proof |
| --- | --- |
| Blank start, skip, existing materials | zero collection rows, all/uncategorized counts, no lesson block |
| Names | Hebrew/Russian/NFC equivalent/case/whitespace sibling collisions incl root; different branches allowed; full path resolution; ambiguous no write |
| Hierarchy | root/child moves, stable UUID, rename, reorder, depth boundary including descendants, self/indirect cycles rejected |
| Multi-placement | same material ID in two branches, subtree distinct results, direct vs recursive, duplicate add idempotent, remove one only |
| Archive/restore | preview counts, preserve older separately archived child, archived target rejection, collisions and archived parent explicit, exact batch restore, stable identities |
| Material lifecycle | content archived before/during add, archived content hidden by default, restoration retains placement, no content revision increments from categorization |
| Evidence | before/after checksum material_links, training_assignments, material_teaching_evidence incl voids, observations, session attendance, financial records and provider rows; all unchanged by organization |
| Templates | three localized versioned definitions, edit/omit/skip, conflicts, replay, later template version no propagation, no content or observations |
| Suggestions | exact metadata candidates, no writes, unknown/ambiguous path clarified, explicit unique placement no extra confirmation, lesson capture without categorization |
| Export/import | parent-first multi-page snapshot, explicit mapping, same-owner verified restore, foreign/missing IDs, cycle, duplicate links, stale cursors, bounded chunks, no partial chunk, archive round trip |
| Security | owner A/B authenticated web/delegated MCP, foreign IDs indistinguishable, read-only/revoked grant, anon/portal/service access denial, direct DML blocked, no credentials, account erasure |
| Replay | same request cross transport and concurrent, changed payload conflict, commit receipt atomic, lost response retry, replay after later edits returns original, independent current read-back |
| Concurrency | two independent DB sessions attempt A→B and B→A at same revision: exactly one success, other stale; retry cannot create cycle. Same sibling create at same revision, reorder vs move, archive vs add, material archive vs add (row lock), restore vs rename, template vs import, membership cap races; no partial commits. Different teachers progress independently. Timeouts rollback and retry identical key. |
| Review | stale/expired/mismatched token, changed actor, permission revoked, altered membership impact, no write until confirmed, negative exact SQL state |
| Bounds/performance | max depth/siblings/collections/memberships and +1, paging stable and bounded, 2k subtree, 100k links, selective indexes/EXPLAIN, lock timeout, no unbounded recursive traversal |
| UX | desktop tree + detail, tablet 2 panes, mobile breadcrumbs/back and focus, touch/keyboard reorder, RTL, en/he/ru, blank/archive/loading/errors/conflicts, no drag-only interaction |
| Parity | every operation in MCP contract table paired authenticated browser+delegated MCP, tools/list root schema + annotations + dispatcher every field + independent read-back + negative permissions. New registry coverage same PR. |
| Schema | exact protected lock predecessor/successor, one baseline, unchanged finance and ratings regressions, independent fresh/warm/restore structure, type inventory, RLS grants, off-target restore refusal, no live database |

Suggested synthetic tests: e2e/parity-material-library.spec.ts; separate SQL fixture and two-connection concurrency harness after approval; pure name/path/tree property tests; no real student data. Check existing e2e/parity-material-coverage.spec.ts, parity-material-defaults.spec.ts, parity-mcp-material-lesson-use.spec.ts, parity-daily-learner-evidence.spec.ts, parity-lichess-oauth.spec.ts, parity-lichess-puzzle.spec.ts, parity-professional-period-end-actuals.spec.ts. Record exact commands, SHA, test counts and URLs, not predicted passes.

## UI handoff
Desktop: tree disclosure, virtual All/Uncategorized/Archived plus searchable list and material inspector, no compulsory fourth pane; visible direct/descendant switch, membership chips with paths, evidence history separately labeled, stable ID links. Tablet collapsible tree, mobile drilldown with breadcrumbs and back stack preserving filters/scroll; tree nodes keyboard navigable, rename/move via menus/dialogs, no drag dependency. Show archive impact and restore conflicts, stale revision refresh/retry (never silently overwrite), template preview/edit and suggestions as optional actions, not setup gate. Existing Lichess tab stays independent; no provider mutation. Coordinate with design-system and lesson-workspace owners before production integration; no UI implementation in this PR.

## Additional boundary cases from follow-up review

- Test canonical normalization on real PostgreSQL 17 with deterministic ICU root collation and recorded version; NFC composed/decomposed equivalence, root case mapping for Latin and Cyrillic, ß versus ss distinct, Hebrew preserved, specified whitespace, reject controls, fail closed if collation changes. Do not claim full Unicode casefold.
- Restore archived root with occupied former sibling name and moved former parent: review explicit root name/destination and descendant rename map; one atomic success, no independent edits to archived objects, no partial restoration. Re-review if destination changes.
- Exact committed retry after preview expiry succeeds with original receipt; expired first execution, changed token, wrong actor, changed digest, revoked grant and direct SQL attempted bypass fail. Re-read current state independently.
- Interactive import of an archived row rejects without writes; full authorized canonical restore preserves archive batches and membership. Check mapping-only existing targets cannot rename/reparent them and subsequent chunks receive original ID mappings after lost response.
- Verify Markdown contract table renders exactly three columns, every advertised tool name unique, normative scenarios have WHEN and THEN clauses, protected blob equality and strict OpenSpec separately.
