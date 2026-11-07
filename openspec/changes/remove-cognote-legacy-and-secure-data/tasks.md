# Tasks — remove-cognote-legacy-and-secure-data

Complete a checkbox only with merged implementation and observed audit/test evidence recorded in docs/STATUS.md.

- [ ] 4.1 Inventory music/practice pages, routes, APIs, components, SQL tables, tests, dependencies and assets; document justified code retained.
- [ ] 4.2 Delete obsolete music/practice implementations and outward API routes (not merely nav links or flags).
- [ ] 4.3 Remove unused music dependencies, index assets, glyphs, sample data and old test fixtures without breaking real chess functionality.
- [ ] 4.4 Replace the inherited 47 SQL migrations with a consolidated **fresh-install-only** canonical baseline plus current RLS/seed; no upgrade chain.
- [ ] 4.5 Verify fresh Supabase initialization, roles/grants, login, storage and teacher onboarding after consolidation.
- [ ] 4.6 Complete ChessCoachPal branding across PWA, service-worker caches, titles, emails, notifications, exports and main navigation; retain MIT attribution.
- [ ] 4.7 Fix main E2E PWA icon failure 42394424153; validate required icons, keyboard accessibility and mobile layout.
- [ ] 4.8 Add real-database RLS/security tests using separate teacher accounts, foreign student IDs, cross-workplace/session IDs and unauthorized reads/writes.
- [ ] 4.9 Audit service-role endpoints, parent/guest token surfaces, log redaction and optional third-party integrations for authorization bypasses.
- [ ] 4.10 Scan source **and old GitHub history/refs, PR refs, CI logs/artifacts** for personal data, tokens, real workplace identities and private URLs; record scope/findings.
- [ ] 4.11 Rotate/remediate any exposures and obtain GitHub-side remediation if needed; never falsely claim inaccessible old SHAs were purged.
- [ ] 4.12 Audit MIT notices, licenses and redistribution rights for bundled dependencies and assets; delete inappropriate material.
- [ ] 4.13 Record passed security, asset review, PWA, build and integration evidence in docs/STATUS.md and docs/SECURITY.md; explicitly approve/block v0.1.0.

## Verification policy — GitHub only
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
