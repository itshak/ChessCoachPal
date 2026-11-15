# Tasks — selective upstream fixes

- [ ] Audit current ChessCoachPal invoice, payment, credits and checkout behavior against upstream CogNote #142; record gaps and exact files/SQL.
- [ ] Implement shared domain-service and transactional SQL changes for partial/full manual draft payments, safe status rollback, paid-total invariants, credit protections and Stripe Checkout invalidation.
- [ ] Add/modify equivalent teacher website and MCP contracts, parity catalogue and documentation.
- [ ] Add synthetic authenticated browser↔MCP and concurrency/replay/security tests, including never-sent draft privacy.
- [ ] Audit all Supabase migration deploy commands against upstream #143 and add explicit target/guard if relevant.
- [ ] Evaluate upstream #144 Vitest patch and update lockfile only if justified.
- [ ] Determine applicability of #145 founding-member billing; implement and test if applicable or document N/A.
- [ ] Run full CI, typecheck, lint, unit, authenticated E2E, security, Compose, backup/restore, strict MCP parity on merged main.
- [ ] Update canonical specs, CHANGELOG and operator docs; archive change with evidence before a subsequent release.
