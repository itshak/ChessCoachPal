# Changelog

All published ChessCoachPal versions appear here and on [GitHub Releases](https://github.com/itshak/ChessCoachPal/releases). Each release includes the corresponding Git tag and automatic ZIP/tar.gz source archives.

## [Unreleased]

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
