# Changelog

All published ChessCoachPal versions appear here and on [GitHub Releases](https://github.com/itshak/ChessCoachPal/releases). Each release includes the corresponding Git tag and automatic ZIP/tar.gz source archives.

## [Unreleased]

_Changes for the next release go here._

## [0.1.8] - 2026-11-18

### Fixed
- Historical attendance import now loads workplace and student rosters independently, so failure of one API no longer empties both dropdowns. Invalid response payloads and missing workplace configuration are explicitly distinguished from request failures.
- Provide translated loading and retry feedback in English, Hebrew and Russian for the historical attendance importer, including workplace and archived-student selection.

### Verification
- Authenticated browser regression verifies the selected teacher's workplace appears in Quick Import, students and workplaces survive independent simulated API outages, and retry restores both lists.
- Preserve unchanged website/MCP attendance import contracts and tenant isolation. Existing strict MCP parity, CI, browser E2E, security, Compose and backup/restore checks passed on PR #100; release publication and Coolify deployment require their own exact-tag gates.


## [0.1.7] - 2026-11-18

### Added
- Full English, Hebrew (RTL) and Russian interface localization with persisted teacher language, localized navigation, login/account/billing/student/event/coaching screens, accessibility labels, keyboard-friendly selector, cross-tab sync, and language-aware web/MCP report output.
- Family-level communication language independent of the teacher UI, including event invitations, reminders, approved notes/cancellations, invoice-preview/send emails and Unicode invoice PDFs with properly rendered Hebrew/Russian/Latin names, mixed-script handling, numbers and QR instructions.
- Localized GoTrue Auth invitation, registration confirmation, password reset, magic link, email change and verification-code templates for existing private-beta SMTP integration. SMTP MIME subject/display name/HTML are encoded safely for Hebrew and Russian. Signed Auth URLs and the private-beta code/verified-email checks remain unchanged.
- Language support for the v0.1.6 historical date-list import and full-data CSV export; English/Hebrew/Russian template and import regression checks preserve exact source records and consent.

### Changed
- Add a forward-only teacher preferred-locale database migration for existing installations; preserve teacher-owned records. The family locale migration is also additive.
- Preserve every post-v0.1.2 improvement on current main (v0.1.6), its 195 MCP tools, full-data CSV features, historical attendance evidence and canonical migrations while integrating the multilingual branch; no compatibility shims or destructive resets.
- Forward-only, owner-scoped live database upgrade for optional guardian communication language; authentic teacher profile changes can mirror display language into Auth mail template metadata without exposing credentials.

### Verification
- Full TypeScript, lint, production build, 2,410 matching EN/HE/RU translated message keys, strict website/MCP parity across 76 business routes and 37 canonical cases, Unicode/RTL PDF and local SMTP/Auth template unit tests; fresh-install database, browser E2E, Compose, encrypted backup/restore and published-release deployment remain GitHub Actions gates.


## [0.1.6] - 2026-11-17

### Added
- Source-neutral historical attendance import: select one workplace, then submit each verified student's real ISO attendance dates. The website and MCP share reviewed previews, explicit confirmation, replay-safe commit and preserved history for archived students.
- Full-data portable CSV: an authenticated website ZIP with separate UTF-8 CSV files for each teacher-owned data category, and a paginated, privacy-redacted CSV table catalogue through MCP. The existing JSON backup remains the supported restore format.

### Fixed
- Increase the bounded MCP JSON-RPC request envelope to 320 KiB so advertised 250-row / 256 KiB direct attendance imports work in practice; reject oversized streams safely.
- Clarify historical attendance MCP target fields and tool selection, add actionable invalid-column errors and use the actual package version in MCP initialization.
- Pin a previously missing floating-ui peer dependency for repeatable clean installs in GitHub Actions and Docker.

### Verification
- Authenticated website/MCP E2E scenarios cover archived pupils, date-list import review/atomic replay, large MCP requests, CSV export consistency and credential redaction; strict website/MCP parity and CI, Compose, Docker, restore and security gates apply.


## [0.1.5] - 2026-11-17

### Fixed
- Repair missing PostgreSQL lifecycle-receipt and historical-attendance RPCs and evidence tables on existing Coolify deployments without resetting teacher data.
- Add an audited, forward-only database schema extension with a preserved canonical fresh-install baseline and safe migration ledger.

### Changed
- Allow up to 250 directly typed historical-attendance rows per reviewed MCP import (256 KiB input cap); keep private staged spreadsheet imports for larger datasets.

### Tests
- Add boundary validation for direct historical import and verify isolated archive, historical summary, replay and rollback behavior.

## [0.1.4] - 2026-11-17

_Changes for the next release go here._

### Added
- Private-beta email ownership verification using GoTrue's signed single-use invitation links, sent through the configured SMTP service only after validating the existing invitation code. The new flow does not issue an account session until the email invitation has been accepted.
- Configurable rollout guard for invitation-only verified-email enrollment, with tests for malformed and invalid codes, sign-up gating, email delivery through an isolated SMTP test inbox, and inability to bypass unverified registration.

### Security
- Require the public Supabase GoTrue signup bypass to stay disabled during verified beta enrollment; fail closed if the site's verification flag disagrees with GoTrue auto-confirm settings.
- Rate-limit approved invitation emails by source and email hash, avoid leaking existing-account status, and keep SMTP credentials confined to the Auth container at runtime.

### Fixed
- Remove the Compose-defined empty SMTP password from the web service, allowing Coolify to manage the Auth SMTP secret as a secure editable runtime variable.

### Changed
- Deploy the canonical private-beta application on the existing Coolify database and service at chesscoachpal.com and api.chesscoachpal.com instead of the obsolete Vercel hostnames; preserve teacher data, existing accounts and the public waitlist.
- Add documented, reversible operator steps for verified-beta SMTP setup and rollout. Email ownership checks remain disabled until a separately verified production SMTP rollout succeeds.

## [0.1.3] - 2026-11-16


### Security
- Close the direct Supabase GoTrue registration bypass in private-beta Coolify deployments. Public GoTrue signup and new-user OTP must remain disabled; the server creates an Auth account only after validating the existing beta invitation code.
- Fail closed when the beta signup route detects inconsistent GoTrue signup or email-confirmation settings. Never expose the service-role key, access code or Auth user enumeration to browsers.

### Changed
- Preserve the beta-code registration flow, existing teacher accounts and public waitlist. Extend isolated Docker Compose verification to cover direct Auth denial, accepted/rejected invite codes, teacher provisioning and waitlist persistence without resetting data.


## [0.1.2] - 2026-11-15

### Changed
- Removed the `v1` segment from every published ChessCoachPal MCP tool identifier: `ccp_v1_*` becomes `ccp_*`. No legacy aliases are retained under the pre-1.0 breaking-change policy.
- Updated the MCP tool catalogue, dispatch, parity inventory, synthetic tests and client documentation to use the single current naming convention. Existing ChatGPT/Claude clients may need a tool refresh or reconnection.
- The HTTPS `/mcp` endpoint, OAuth scopes and teacher data remain unchanged; no database migration or destructive reset is required.

## [0.1.1] - 2026-11-15

### Added
- Safe full or partial manual payments on saved draft invoices without delivering or publishing them to families, with shared teacher website/MCP operations and replayable receipts.
- Invoice PDF and send previews with previously paid and remaining-balance amounts, and a database-locked send claim to prevent stale checkout or email totals.
- Migration destination guard, hosted founding billing-cancellation operator script, and authenticated payment-parity regression coverage.

### Fixed
- Payment reversal now restores never-sent paid invoices to private drafts, while preserving sent-invoice behavior and refusing irreversible credit/payment loss.
- Stripe subscriptions linked to founding hosted entitlements are cancelled with webhook retries and preserved billing portal access.
- Vitest and mocker patched to 4.1.12 for dependency hardening.

_No private business strategy, unpublished pricing, or subscription entitlements are announced by these technical changes._

## [0.1.0] - 2026-11-15

### Added
- MCP-first chess-coaching workflows for student profiles, aliases, workplace enrollment, groups, individual and shared lessons, attendance, reports and editable learning history.
- Authenticated website and MCP tools sharing teacher-scoped domain services, OAuth authorization, revision checks and idempotent write receipts.
- Typed chess learning materials, Lichess study/chapter and puzzle workflows, safe teacher-reviewed chapter assignment and atomic lesson-plus-chapter capture.
- Teacher, workplace and student Lichess study preferences with deterministic resolution and conflict-safe multi-student preview.
- Fresh-install self-hosted Compose setup, database and uploaded-file backup/restore, and automated security, parity and browser acceptance workflows.

### Security
- Enforced tenant isolation and fail-closed review of provider evidence; synthetic cross-tenant, rollback and exact-replay tests.
- Historical GitHub Actions/privacy and third-party redistribution disposition remains a prepublication review item; no clearance is implied by this changelog.

### Changed
- No pre-1.0 compatibility guarantee with CogNote or older ChessCoachPal development databases; back up any existing data before a destructive reset.


### Added
- Expanded scoped MCP coaching tools for workplace/student/group creation and edits, enrollment, one-off session scheduling/rescheduling/cancellation and lesson readback, with atomic idempotency receipts, revision checks, and synthetic OAuth scope/tenant security tests.
- Deterministic teacher-scoped workplace/date-range teaching and attendance report with RTL-aware Hebrew presentation and safe CSV/text export.
- Guarded current-schema full-database/uploaded-file backup and second-installation restore scripts, SHA-256 checks, synthetic CI restore workflow, and operator tutorial.
- A versioned release process with validated SemVer tags, release notes extracted from this changelog, fresh-install tests, and automatic GitHub Release publishing.
- A release readiness checklist to reserve `v0.1.0` for the first genuinely usable chess-teaching application.

### Changed
- Switched original ChessCoachPal development to a proprietary source license, retaining CogNote's MIT notice and historical MIT grants; Git history and public GitHub Actions remain unchanged (ADR-0002).
- Reset the inherited `package.json` version to `0.0.0` to identify unreleased development snapshots; no public version has been published yet.
- Pre-1.0 versions explicitly have no compatibility commitment to CogNote or to earlier ChessCoachPal versions. See [ADR-0001](docs/adr/0001-pre1-breaking-changes.md).

<!-- Add user-facing changes above, organized as Added/Changed/Fixed/Removed/Security.
     Run: npm run release:prepare -- 0.1.0
     A release requires a reviewed, dated version section and passing checks.
     Do not tag or publish the first v0.1.0 until its functional readiness criteria pass. -->
