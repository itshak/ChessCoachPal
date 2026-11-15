# Tasks — selective upstream fixes

- [x] Audit current ChessCoachPal invoice, payment, credits and checkout behavior against upstream CogNote #142; record gaps and exact files/SQL.
- [x] Implement shared domain-service and transactional SQL changes for partial/full manual draft payments, safe status rollback, paid-total invariants, credit protections and Stripe Checkout invalidation.
- [x] Add/modify equivalent teacher website and MCP contracts, parity catalogue and documentation.
- [x] Add synthetic authenticated browser↔MCP and concurrency/replay/security tests, including never-sent draft privacy.
- [x] Audit all Supabase migration deploy commands against upstream #143 and add explicit target/guard if relevant.
- [x] Evaluate upstream #144 Vitest patch and update lockfile only if justified.
- [x] Determine applicability of #145 founding-member billing; implement and test if applicable or document N/A.
- [x] Run full CI, typecheck, lint, unit, authenticated E2E, security, Compose, backup/restore, strict MCP parity on merged main.
- [x] Update canonical specs, CHANGELOG and operator docs; archive change with evidence before a subsequent release.

## Acceptance record

Merged implementation: [PR #75](https://github.com/itshak/ChessCoachPal/pull/75), exact [main commit `394592c`](https://github.com/itshak/ChessCoachPal/commit/394592c446e23767459b79ca226d0101d3c4dc3c).

Merged-main verification: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43683559454) (458 unit tests, 93/93 strict MCP parity, lint/typecheck, schema and PR guards); [authenticated browser↔MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43683559483) (258 passed, 5 pre-existing skipped); [security-history](https://github.com/itshak/ChessCoachPal/actions/runs/43683559491); [self-host Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43683559463); [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/43683559488). All were successful on the integrated SHA.

Identical PR-head five gates succeeded on `291a72cd9380be9a874df1efe8dbcb0cb01aae83` before merge: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/43683059434), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/43683059438), [security](https://github.com/itshak/ChessCoachPal/actions/runs/43683059437), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/43683059474), [restore](https://github.com/itshak/ChessCoachPal/actions/runs/43683059462).

**Scope boundary:** synthetic integrations and workflow tests do not represent a completed live real-account ChatGPT/Claude, real Stripe billing/refund, or operational/customer release authorization. Existing `v0.1.0` tag and published release were not modified.
