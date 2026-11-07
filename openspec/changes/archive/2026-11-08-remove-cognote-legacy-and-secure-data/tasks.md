# Tasks — remove-cognote-legacy-and-secure-data

Complete a checkbox only with merged implementation and observed audit/test evidence recorded in docs/STATUS.md.

- [x] 4.1 Inventory music/practice pages, routes, APIs, components, SQL tables, tests, dependencies and assets; document justified code retained.
- [x] 4.2 Delete obsolete music/practice implementations and outward API routes (not merely nav links or flags).
- [x] 4.3 Remove unused music dependencies, index assets, glyphs, sample data and old test fixtures without breaking real chess functionality.
- [x] 4.4 Replace the inherited 47 SQL migrations with a consolidated **fresh-install-only** canonical baseline plus current RLS/seed; no upgrade chain.
- [x] 4.5 Verify fresh Supabase initialization, roles/grants, login, storage and teacher onboarding after consolidation.
- [x] 4.6 Complete ChessCoachPal branding across PWA, service-worker caches, titles, emails, notifications, exports and main navigation; retain MIT attribution.
- [x] 4.7 Fix main E2E PWA icon failure 42394424153; validate required icons, keyboard accessibility and mobile layout.
- [x] 4.8 Add real-database RLS/security tests using separate teacher accounts, foreign student IDs, cross-workplace/session IDs and unauthorized reads/writes.
- [x] 4.9 Audit service-role endpoints, parent/guest token surfaces, log redaction and optional third-party integrations for authorization bypasses.
- [ ] 4.10 Scan source **and old GitHub history/refs, PR refs, CI logs/artifacts** for personal data, tokens, real workplace identities and private URLs; record scope/findings.
- [ ] 4.11 Rotate/remediate any exposures and obtain GitHub-side remediation if needed; never falsely claim inaccessible old SHAs were purged.
- [x] 4.12 Audit MIT notices, licenses and redistribution rights for bundled dependencies and assets; delete inappropriate material.
- [x] 4.13 Record passed security, asset review, PWA, build and integration evidence in docs/STATUS.md and docs/SECURITY.md; explicitly approve/block v0.1.0.

## GitHub verification and unfinished publication review

[PR #9](https://github.com/itshak/ChessCoachPal/pull/9) was squash-merged as [af9f4c6](https://github.com/itshak/ChessCoachPal/commit/af9f4c64de70e6b96674c5eb46fcaad35381548a). [Feature CI 42421265827](https://github.com/itshak/ChessCoachPal/actions/runs/42421265827), [E2E 42421265817](https://github.com/itshak/ChessCoachPal/actions/runs/42421265817) (25 passed, 5 skipped), and [reachable-history audit 42421265798](https://github.com/itshak/ChessCoachPal/actions/runs/42421265798) passed. On merged main, [CI 42421647203](https://github.com/itshak/ChessCoachPal/actions/runs/42421647203), [E2E 42421647198](https://github.com/itshak/ChessCoachPal/actions/runs/42421647198) (25 passed, 5 skipped) and [history audit 42421647204](https://github.com/itshak/ChessCoachPal/actions/runs/42421647204) also passed.

- **4.10 remains open for complete Actions log/artifact and historical personal-data/private-link review.** Source and accessible Git refs have an automated high-confidence secret scan (20 refs, 787 readable blobs, no confirmed credential). A separate GitHub-only Actions audit is being implemented with a redacted report; its findings must still be reviewed before release.
- **4.11 remains open for any newly found exposure**, appropriate rotation and GitHub-side remediation if recoverable old SHAs expose real secrets or records. Existing synthetic seeded data and the one Docker environment-variable placeholder are not production disclosures. No historical purge is claimed.
- These open checks are **explicitly transferred to Milestone 5 task 5.9** and remain a hard v0.1.0 publication blocker. This archive records completed implementation; it is not approval of an unsafe release.

## Verification policy — GitHub only
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
