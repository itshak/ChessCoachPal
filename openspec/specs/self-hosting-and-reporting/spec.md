# Applied self-hosting and reporting specification — Milestone 5 automated subset

**Source:** [archived verified development change](../../changes/archive/2026-11-08-verify-self-hosting-and-release-v0-1-0/proposal.md), merged [PR #11](https://github.com/itshak/ChessCoachPal/pull/11) at [main commit 3feae05](https://github.com/itshak/ChessCoachPal/commit/3feae05240339ac525b17593d9d194f80453e898); CI [42427869325](https://github.com/itshak/ChessCoachPal/actions/runs/42427869325), E2E [42427869349](https://github.com/itshak/ChessCoachPal/actions/runs/42427869349), security [42427869343](https://github.com/itshak/ChessCoachPal/actions/runs/42427869343), Compose [42427869301](https://github.com/itshak/ChessCoachPal/actions/runs/42427869301), backup/restore [42427869543](https://github.com/itshak/ChessCoachPal/actions/runs/42427869543). **Status:** Implemented on main, automated evidence only. No v0.1.0 publication or live ChatGPT/Claude interoperability is claimed.

## Requirements

### Requirement: Website operations without mandatory external AI
A new teacher SHALL be able to install the current self-hosted ChessCoachPal schema, sign up and use the website without an OpenAI, Anthropic, Notion, Google or Lichess account.

#### Scenario: Fresh setup has no AI subscription
- **WHEN** GitHub starts the actual Compose stack with disposable credentials and a clean database
- **THEN** the app, gateway, migrations and account signup SHALL work without an external provider.

### Requirement: Current-schema DB and uploaded-file recovery
An operator SHALL use an explicitly confirmed, checksummed backup to restore auth/app/storage table data and uploaded file bytes only into a second empty current-schema installation. No CogNote or pre-1.0 upgrade path is supported.

#### Scenario: Recovery of group lesson and participant record
- **WHEN** the synthetic data and uploaded bytes are backed up and restored into an independent installation
- **THEN** relational row counts and attendance records SHALL match, file contents SHALL match byte-for-byte, and repeated restore into the populated target SHALL be refused.

### Requirement: Deterministic teacher-authorized workplace reporting
For an authenticated teacher and one selected workplace, the app SHALL report noncancelled teaching minutes once per session and attendance per participant over inclusive workplace-local dates. Safe CSV and text export SHALL omit private student notes, and supported Hebrew locale SHALL display the report in RTL.

#### Scenario: Four students attend a one-hour group
- **WHEN** a 60-minute group lesson has four participants
- **THEN** the report SHALL show 60 minutes and four independent attendance statuses, rather than 240 minutes.

## Release boundary

These requirements are implemented and GitHub-verified; final vendor sign-off, historical privacy/license approval, remaining agent tools and the actual v0.1.0 tag/release stay in [active final-publication change](../../changes/finalize-v0-1-0-publication/proposal.md). Do not check final readiness boxes based on synthetic tests.
