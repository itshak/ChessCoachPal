# Implementation progress and source reconciliation (not acceptance)

**Date:** 2026-11-11
**Change:** `converge-chess-core-and-complete-mcp-parity`
**Source PRs:** [#44](https://github.com/itshak/ChessCoachPal/pull/44), [#48](https://github.com/itshak/ChessCoachPal/pull/48), [#49](https://github.com/itshak/ChessCoachPal/pull/49)
**Active spec PR:** [#50](https://github.com/itshak/ChessCoachPal/pull/50)
**Draft implementation PR:** [#51](https://github.com/itshak/ChessCoachPal/pull/51)

**This is an implementation ledger, not checked-off acceptance.** The integrated branch is deliberately draft/unmerged. No private business strategy, real children's records or unpublished plan pricing is included. The live production database has not been modified.

## A. Source conflict decisions made

The initial integration commit `a5f5f86575668ae29e1a1d013bb9e167c3ea31c0` uses PR #50's spec commit, merges the retained 221 changed paths from PR #44 and the 16 changed paths from PR #49 (which contains typed material work descended from #48). It merges five overlaps explicitly:

| Overlap | Final owner/disposition |
| --- | --- |
| `app/(teacher)/learning/page.tsx` | Both Lichess study/preview/publishing and new typed catalog/homework in one student-first Training page |
| `lib/server/agent-tools.ts` | Unified existing `/mcp` catalogue, retains legacy finance/guardians/events and adds typed catalog/homework/briefing tools |
| `e2e/agent-mcp.spec.ts` | Retains long existing OAuth workflow with new typed material/homework/briefing and correction integration assertions |
| `e2e/coaching.spec.ts` | Retains coaching flow and adds student-first/secondary professional navigation test |
| `scripts/mcp-website-parity.json` | Union of route/page/component inventories; no deletion of retained functionality or dropping tools |

The stacked PR #49 has an actual ancestry divergence from the #48 tip in one service file, but its source contains the typed baseline and homework migrations. The final source explicitly includes all typed material root and subtype tables plus assignments, attempts and reviews; source ancestry is recorded in the multi-parent integration commit.

## B. Material and briefing integration implemented (not yet certified)

- Typed `learning_materials` game/puzzle/drill/study/link create/list/get; one server FEN validator shared with the reviewed Lichess preview; shared MCP tools and website catalog.
- Revision-checked, typed, atomic material root/subtype correction via `ccp_material_catalog_update`, with durable same-key replay receipt and post-row-lock concurrent replay check.
- Source-game extraction/derived/prerequisite material relationships, teacher RLS, ordered root locks and atomic link/unlink revision receipts, with browser/MCP tools and test coverage.
- History-preserving archive/restore for **unreferenced** catalog materials: archive impact discloses assignment and relationship counts; busy materials are protected. Historical records are not deleted. Archive is a soft removal from active search, not silent irreversible erasure.
- Student next-lesson briefing reading shared unified lesson history, teacher-attested material history, typed homework and coach-approved observations, with explicit unknowns; the student profile can request the same briefing MCP exposes.
- Lichess puzzle external publish now idempotently creates/reconciles the confirmed study chapter in the typed catalog; a local synchronization failure reports a pending-material condition rather than initiating another remote publish.
- Complete source tests written for these features, including concurrent duplicate website/MCP corrections and lifecycle, revision conflicts, provider ownership and local typed readback. The integration remains unaccepted until executed against the complete synthetic stack.

## C. Mocked external provider workflows added (not actual provider acceptance)

- CI-only `CCP_SYNTHETIC_VISION_ORIGIN=http://127.0.0.1:3998`: exactly whitelisted fixed loopback OpenAI-compatible vision response. A board image cannot establish side, castling, en passant or counters; the mocked provider deliberately lies about these fields and the server neutralizes them, then an explicit reviewed FEN is published through the pre-existing Lichess provider mock.
- CI-only `CCP_SYNTHETIC_STRIPE_ORIGIN=http://127.0.0.1:3997`: only a fixed local Stripe SDK host/port/protocol override, never a user-configurable production endpoint. The synthetic flow covers configured checkout, browser/MCP receipt readback, PDF, manual settlement after provider checkout expiry and same-row CSV ledger.
- No real payment cards, provider transactions, OpenAI/Claude/Lichess production tokens or private plan values appear in fixture data. Synthetic key text is generated at runtime.
- Existing separate real ChatGPT/Claude delegated provider test remains prepublication-only by explicit project decision.

## D. Parity evidence inventory and unresolved obligations

The integrated source registry currently lists **58** teacher-business API route families: **23 marked `mcp`, 16 `partial`, 19 `gap`**. Those are **inherited classifications**, not fresh verification of this integrated code. The earlier PR #44 prose claims 24 complete/10 partial/19 gap in 53 routes; the actual #44 registry is 23/11/19. This discrepancy is reconciled only at the registry source level; **do not choose the more optimistic number without evidence**.

The earlier PR #44 checklist still reports **87 of 93** named historical scenarios accepted on a prior branch; those tests must all rerun and the six previously unchecked cases need actual sign-off. Additional chess-first scenarios remain required. No checklist row or route has been cosmetically promoted by this implementation. `npm run mcp:parity:strict` must remain red until the full source/field/action test matrix is actually complete.

Open implementation work includes: one canonical completed-lesson writer and legacy historical reconciliation; student-first optional contacts/payer roles; explicit learning material ↔ legacy teaching evidence migration/projection; assignment/goals/plans lifecycle corrections and full field parity; recurring scheduling/holidays and concurrent slots; the full financial/provider/guardians/events route-family security/replay matrix; exhaustive editable website field/action evidence; secure account and subscription browser handoffs and final exact-head tests. **No OpenSpec change may be archived yet.**

## E. Test campaign history (do not infer new-head passing)

Prior integration candidate `4c8ccbde68224c6a3f2fcb7c38d8775d722530a1` passed TypeScript, **421** unit tests, normal parity source audit/guard, security history audit, self-host Compose and backup/restore. Its browser E2E run [43039411279](https://github.com/itshak/ChessCoachPal/actions/runs/43039411279) failed **before executing any test** because GitHub runner DNS could not resolve Ubuntu apt font-package mirrors during `playwright install --with-deps`; the fresh Supabase migration and app build had succeeded. The workflow now installs Chromium directly on GitHub-hosted runners, whose preinstalled shared libraries are still checked at browser launch. This is an infrastructure recovery, not a waived product test.

On any new candidate, run full unit/typecheck, all browser↔delegated MCP tests, security/history, Compose, backup/restore and strict parity. Only exact-head successful executions can be accepted. Keep PR #51 in draft until the entire Stage B/C backlog, not merely this ledger, is complete.

## F. Verified integration checkpoint and still-open release gate (2026-11-11)

At exact commit `f25b360328f6b5964a26fbd1a87b08f38eb67da2` the five synthetic runs were successful: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43068237617), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43068237786) (**178 passed, five intentionally skipped, no failures**), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43068237609), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43068237709), and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43068237647).

This confirms the legacy material→typed catalog bridge, cross-interface idempotent mapping/replay, historical-link archive guard and positive synthetic Lichess/Stripe journeys. Two new named historical checklist cases are now supported: `PARITY-image-photo-vision-to-reviewed-FEN-to-published-typed-study` and `PARITY-configured-checkout-pdf-ledger`; historical scenario acceptance is **89/93** on that verified head.

Newer, unaccepted development adds teacher-authored student training plans and individual goals, evidence-requiring goal achievement, immutable revision snapshots, one shared website/MCP commit service, student editor and deterministic coach-briefing integration. The new plan's schema, migration, endpoint, client and dedicated E2E are **candidate code until all current-head tests pass**. The inventory is now **60** teacher-business route families (23 tagged complete, 18 partial, 19 gap), not 53. The 37 incomplete statuses are not silently dismissed.

**Critical additional release gap:** the existing portable teacher data-transfer allowlist and its atomic restore function have not yet been extended to include all newer typed material catalog, homework, legacy mapping and training-plan tables. Ordinary Compose/backup infrastructure checks do **not** prove the portable tenant export captures those new records. Do not declare B10, backup parity or this OpenSpec complete without a safe, transactionally verified export/restore implementation and own-tenant/cross-tenant test. The dual completed-lesson writer, comprehensive calendar/holidays, goal/assignment corrections and all remaining route-field evidence also remain outstanding.

Keep PR #51 draft, all active OpenSpecs open and the strict parity release gate red until exact merged-main verification.

## G. Training-plan integration acceptance checkpoint (2026-11-11)

The student training plan/goals, immutable snapshots and coach briefing source merge passed on exact commit `9b146fbc27efc98cf2145f15d6ea8dda389fda45`: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43070799782) (**426 unit tests + typecheck**), [browser/delegated-MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43070799492) (**179 passed, five intentionally skipped, none failed**), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43070799458), [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43070799222) and [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43070799542).

A follow-up source change extends student deletion-impact previews to count stored training plans and homework as history blockers, adds cross-interface test assertions, and retains success messages on the student plan editor. These post-checkpoint changes require their own exact-head evidence. **This is NOT complete OpenSpec acceptance:** portable tenant export of the added tables, canonical single-writer lessons, scoped contacts/payers, attendance/calendar and remaining 37 route-family parity gaps persist. Strict parity is intentionally not green and no merge/archive/release is authorized.
