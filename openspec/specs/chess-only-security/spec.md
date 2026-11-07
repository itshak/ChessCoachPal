# Applied chess-only/security specification — Milestone 4

**Source:** [archived change](../../changes/archive/2026-11-08-remove-cognote-legacy-and-secure-data/specs/chess-only-security/spec.md). [PR #9](https://github.com/itshak/ChessCoachPal/pull/9) was squash-merged as [af9f4c6](https://github.com/itshak/ChessCoachPal/commit/af9f4c64de70e6b96674c5eb46fcaad35381548a). [Feature CI 42421265827](https://github.com/itshak/ChessCoachPal/actions/runs/42421265827), [E2E 42421265817](https://github.com/itshak/ChessCoachPal/actions/runs/42421265817) (25 passed, 5 skipped), and [reachable-history audit 42421265798](https://github.com/itshak/ChessCoachPal/actions/runs/42421265798) passed. On merged main, [CI 42421647203](https://github.com/itshak/ChessCoachPal/actions/runs/42421647203), [E2E 42421647198](https://github.com/itshak/ChessCoachPal/actions/runs/42421647198) (25 passed, 5 skipped) and [history audit 42421647204](https://github.com/itshak/ChessCoachPal/actions/runs/42421647204) also passed.

**Status:** Current implementation accepted on GitHub; historical privacy/Actions/asset final review remains an explicit v0.1.0 publication gate, not a claimed completed purge.

## Requirements

### Requirement: Clean current schema with zero CogNote compatibility
ChessCoachPal SHALL initialize its teacher/workplace/group/session/student data from a reproducible current schema and SHALL NOT keep CogNote-only routes, practice data tables or compatibility aliases.

#### Scenario: Start an empty database
- **WHEN** an installer provisions a fresh local Supabase instance
- **THEN** current chess coaching tables, RLS, grants and synthetic seed SHALL initialize successfully
- **AND** no CogNote legacy upgrade or old ChessCoachPal migration SHALL be required.

### Requirement: No unapproved destructive reset
A breaking pre-1.0 schema change SHALL be documented as requiring an explicit operator-selected fresh install or disposable database reset; real records MUST NOT be silently deleted.

#### Scenario: Existing database contains students
- **WHEN** an operator upgrades source across an incompatible development schema
- **THEN** the documentation SHALL require a backup and explicit reset decision
- **AND** application startup SHALL not silently erase existing records.

### Requirement: Teacher isolation through auth and RLS
All coaching and learning data SHALL be scoped by authenticated teacher and related workplace, enforced by code and Postgres RLS.

#### Scenario: Teacher B guesses a session UUID
- **WHEN** teacher B requests teacher A's group session and attendance by UUID
- **THEN** no protected data SHALL be returned or changed
- **AND** error responses SHALL not reveal private names or notes.

### Requirement: ChessCoachPal identity and license provenance
The user interface, PWA and published screenshots SHALL use the ChessCoachPal product identity and accessible usable icons, while required CogNote MIT attribution SHALL remain available in legal documentation.

#### Scenario: Install the web app
- **WHEN** an installer inspects its web manifest
- **THEN** the product SHALL be ChessCoachPal with tested installable icons
- **AND** no old music practice product identity SHALL remain visible.

### Requirement: Evidence-based privacy and asset approval
Before release, maintainers SHALL inspect active source, retrievable GitHub history, build logs/artifacts, real student or workplace data, secrets and redistributable assets. A branch rewrite alone SHALL NOT count as a complete historic purge.

#### Scenario: Old SHA exposes a credential
- **WHEN** historical inspection finds a recoverable token
- **THEN** maintainers SHALL rotate/remediate it and follow supported GitHub removal guidance if necessary
- **AND** release approval SHALL remain blocked until resolution is documented.

## Development verification boundary
All implementation and acceptance evidence for this development change SHALL come from merged GitHub commits and passing GitHub Actions tests/automated scans with synthetic data. No manual local deployment, live Lichess/ChatGPT/Claude login or actual vendor-client session is required to check tasks or archive this change. Record test URLs/findings in docs/STATUS.md (and docs/SECURITY.md for audits). The only real ChatGPT/Claude client exercise takes place at the **final local v0.1.0 prepublication release gate**; it does not waive security/privacy review requirements that can be completed in GitHub.
