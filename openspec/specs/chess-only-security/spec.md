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

### Requirement: Pre-v1 canonical Supabase security and install parity

One installation snapshot, `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`, SHALL define the **current** public tables/functions, RLS, least-privilege grants, triggers, fixed function search paths and necessary foreign-key indexes. It SHALL be used by fresh CI, Compose and second-install backup/restore tests. A running disposable database MAY receive equivalent transactional hardening **in place**; no incremental migration chain or compatibility view SHALL be created.

Before and after Supabase changes, maintainers SHALL check **security and performance advisors**, test actual `anon`/`authenticated` permissions, and document intentional warnings. Trigger-only `SECURITY DEFINER` functions SHALL NOT be directly executable as public/authenticated REST RPCs; owner-scoped business RPCs SHALL retain intentional `authenticated` execute only with stable `search_path`, explicit `auth.uid()`/ownership safeguards, and cross-tenant tests. RLS enabled with no policies on a **server-only** table is a deliberate deny boundary; no broad policy SHALL be added merely to suppress INFO. For the public waitlist, only the rate-limited server service-role route SHALL have table-write privileges; direct `anon`/`authenticated` table grants SHALL be absent even if RLS would otherwise deny rows.

#### Scenario: SQL reports a trigger RPC available anonymously
- **WHEN** the advisor identifies a trigger-only `SECURITY DEFINER` function executable by `anon`
- **THEN** canonical SQL and the live test DB SHALL revoke direct role execution while verifying the actual INSERT/UPDATE trigger still runs as intended.

#### Scenario: RLS or foreign-key optimization
- **WHEN** advisors flag per-row `auth.uid()`/`current_setting` or missing FK indexes
- **THEN** use scalar `(SELECT auth.uid())`/`(SELECT current_setting(...))` initplan expressions and suitable indexes without changing teacher ownership; a small new DB's unused-index INFO is not proof those indexes should be deleted.

#### Scenario: User-approved reset of stale test database
- **WHEN** actual physical columns do not match the source snapshot and the user explicitly permits a disposable reset
- **THEN** preserve Supabase-owned `auth`/`storage` schema, use supported APIs for Storage objects, handle surviving bucket policies, apply the canonical snapshot transactionally, and record one baseline migration; test an authenticated write/read and rollback.
- **AND** a database with actual users/children's records MUST NOT be reset implicitly.

#### Scenario: Hosted Auth feature outside SQL
- **WHEN** Supabase warns about leaked-password protection
- **THEN** record it as a provider Auth dashboard/plan-setting remediation (Pro+ as documented), not as if a SQL patch resolved it.

See [the review playbook](../../../docs/MCP_SUPABASE_RELIABILITY_PLAYBOOK.md) and [ADR-0007](../../../docs/adr/0007-mcp-supabase-contract-and-release-evidence.md).


### Requirement: Private beta enrollment is not bypassable through public Auth

When `NEXT_PUBLIC_BETA_ONLY=true`, the system SHALL require a nonempty server-only beta access code on the website signup route and SHALL prevent public GoTrue clients from creating a user through `/auth/v1/signup` or other direct signup paths. The website SHALL create a beta identity only through an authorized server-only Auth admin operation **after** validating the access code. Public Auth signup-disable and email-confirmation settings SHALL be tied to the same deployment configuration as the website guard and fail closed when inconsistent. The beta waitlist SHALL remain available without a code; existing accounts SHALL still sign in. No `service_role` key or invite code SHALL be exposed to a browser or MCP client.

#### Scenario: No code or direct public Auth signup
- **WHEN** a visitor sends an absent/invalid code to the website OR calls the public GoTrue signup API directly with a valid-looking address and password
- **THEN** no new `auth.users` record SHALL be created, and the caller SHALL not receive authenticated teacher access.

#### Scenario: Valid beta code
- **WHEN** the code matches and the Auth provider has public signup disabled under the configured private-beta policy
- **THEN** a server-side admin Auth call SHALL create one account, provision the scoped teacher record and permit password login; the waitlist handler SHALL continue to record requests without a beta code.

#### Scenario: Deployment drift or email verification change
- **WHEN** GoTrue public signup remains enabled, or the configured beta email-auto-confirm policy changes without a working mail-confirmation flow
- **THEN** the website beta creation path SHALL fail closed with no privileged account creation, and deployment acceptance SHALL fail rather than silently reverting to open signup or bypassing email verification.
