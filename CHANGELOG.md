# Changelog

All published ChessCoachPal versions appear here and on [GitHub Releases](https://github.com/itshak/ChessCoachPal/releases). Each release includes the corresponding Git tag and automatic ZIP/tar.gz source archives.

## [Unreleased]

### Added
- Deterministic teacher-scoped workplace/date-range teaching and attendance report with RTL-aware Hebrew presentation and safe CSV/text export.
- Guarded current-schema full-database/uploaded-file backup and second-installation restore scripts, SHA-256 checks, synthetic CI restore workflow, and operator tutorial.
- A versioned release process with validated SemVer tags, release notes extracted from this changelog, fresh-install tests, and automatic GitHub Release publishing.
- A release readiness checklist to reserve `v0.1.0` for the first genuinely usable chess-teaching application.

### Changed
- Reset the inherited `package.json` version to `0.0.0` to identify unreleased development snapshots; no public version has been published yet.
- Pre-1.0 versions explicitly have no compatibility commitment to CogNote or to earlier ChessCoachPal versions. See [ADR-0001](docs/adr/0001-pre1-breaking-changes.md).

<!-- Add user-facing changes above, organized as Added/Changed/Fixed/Removed/Security.
     Run: npm run release:prepare -- 0.1.0
     A release requires a reviewed, dated version section and passing checks.
     Do not tag or publish the first v0.1.0 until its functional readiness criteria pass. -->
