# Design — legacy removal and secure fresh bootstrap

## No compatibility scaffolding

ADR-0001 is binding. Keep one small authoritative SQL installation snapshot (or separately a baseline + current RLS file if required by Supabase CLI) and explicit seed; remove the inherited incremental SQL timeline. Never retain ALTER/backfill migrations, compatibility views, dual reads/writes or old API routes solely to support CogNote or older ChessCoachPal versions. Developers consciously reset **disposable** databases; do not silently destroy real data.

## Removal and dependency audit

Map music/practice pages and routes to their components, API calls, tables, dependencies, tests and assets. Remove obsolete practice tokens, score/music assignment routes, notation flashcards, Bravura/SMuFL resources, VexFlow/OSMD and unused music indexes if they are not needed for chess coaching. Delete orphaned imports, migrations, test fixtures and nav items at the same time. Retain copyright attribution and MIT provenance, but remove obsolete active product branding. Verify email, PDF, PWA/service-worker, portal and navigation surfaces.

## Defense-in-depth

Teacher identity is resolved server-side; apply real database RLS to students, workplaces, groups, sessions, attendance, notes and learning resources. Use two independent authenticated users to assert foreign-ID, cross-workplace joins, anonymous reads and writes, parent token abuse and service-role route misuse fail. Keep service credentials entirely on the server, and never serialize private payloads in errors or CI logs.

## Public repository historic review

The repository is already public. Check current code and old GitHub refs, tags, cached SHAs, PR refs, workflow logs and artifacts for secrets, learner identities, real school/workplace data and private links; check redistributed files/fonts/indexes and their licenses. Document exact inspection scope and findings in docs/SECURITY.md; rotate and remediate any exposed credentials immediately. GitHub may retain old objects after history rewrite, so only claim purging if verified via supported GitHub remediation.

## Verification

- Reinitialize fresh Supabase including required grants/storage, no legacy schema dependencies.
- Test removed endpoints do not expose any old behavior.
- Run real RLS and token-boundary tests and privacy-preserving error checks.
- Fix main Playwright PWA manifest failure (GitHub Actions 42394424153: one icon versus required two).
- Test installable ChessCoachPal icons, accessible controls and responsive pages.
- Record traceable review evidence, passing tests, source/asset licenses and any unaddressed findings.

No release sign-off merely because main is publicly accessible.

## Development verification boundary
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
