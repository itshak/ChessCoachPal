# Proposed specification delta: student-chess-profiles

**Status: PROPOSED.** No new fields or MCP tools are implemented yet.

## Requirements and acceptance scenarios

### Requirement: Preserve Hebrew reporting name and English conversational aliases
- **WHEN** a teacher saves a student with canonical full name `ארמונד לוי` and English short alias `Armond`
- **THEN** official attendance reports and exports SHALL use `ארמונד לוי`, while `students_resolve(["Armond"])` SHALL resolve to the same stable UUID, never create a duplicate.
- **WHEN** a teacher says `Shushana` but the canonical name is Hebrew `שושנה ...`
- **THEN** the teacher-entered English alias SHALL resolve without requiring exact transliteration, casing or punctuation.
- **WHEN** two teacher-owned students share "David" as an alias
- **THEN** the resolver SHALL return `NEEDS_RESOLUTION` with safe distinguishing names/workplaces and SHALL NOT mark attendance or silently choose one.
- **WHEN** a teacher edits an alias or canonical Hebrew name
- **THEN** all prior lessons SHALL retain stable ID associations, report names SHALL use current canonical report name by documented policy, and history SHALL be traceable without changing student identity.
- **WHEN** a teacher provides Unicode mixed-script names/RTL, combining marks or punctuation
- **THEN** search normalization SHALL be documented, secure, tested and must not silently merge distinct learners.

### Requirement: Chess strength 1–10 is a teacher judgment, not an online rating
- **WHEN** a teacher enters a valid integer from 1 through 10 with date/notes
- **THEN** the profile SHALL show the latest teacher-assessed strength and an append-only dated strength history.
- **WHEN** nobody has evaluated the student
- **THEN** strength SHALL be null / "Not assessed," not 0, 1 or an inferred value.
- **WHEN** an AI proposes "the student understood opposition well" without explicit teacher evaluation
- **THEN** any generated observation SHALL remain unverified; it SHALL NOT alter teacher strength or `skill_assessments` until confirmed.
- **WHEN** dimension ratings in existing `skill_assessments` (1–5) exist
- **THEN** they SHALL remain distinct from the overall 1–10 rating and from source-labeled chess observations; migration SHALL not overwrite or reinterpret old scores.

### Requirement: External account handles and meaningful provider-specific rating snapshots
- **WHEN** a teacher adds a Lichess username or Chess.com username
- **THEN** the username and canonical profile URL SHALL be saved teacher-scoped with source/verification status, never as a provider secret or password.
- **WHEN** public account ratings are available
- **THEN** the service SHALL store provider, time-control (rapid/blitz/bullet/classical/daily/puzzle where offered), numerical rating, provisional/status, sample games if provided, observation date, fetch date and source.
- **WHEN** provider reports Lichess blitz 1200 and Chess.com rapid 900
- **THEN** they SHALL remain separate labeled measurements; neither SHALL be called generic chess strength or automatically converted into 1–10.
- **WHEN** account has no ratings, is private/unavailable, or public API returns 429
- **THEN** the teacher SHALL see unavailable/stale status; no invented zero score or unbounded retry.
- **WHEN** student has no account or teacher declines network lookup (especially for a minor)
- **THEN** profile, lessons, strengths, goals and attendance SHALL remain functional without provider calls.

### Requirement: Website and MCP show the same protected progress
- **WHEN** a teacher updates the canonical full name, aliases, strength, account handle or goals in website
- **THEN** the MCP profile reads SHALL show the same revisioned data and safe projections; changes via MCP SHALL be visible after refresh.
- **WHEN** a teacher opens the student profile
- **THEN** it SHALL offer name/report identity, short aliases, 1–10 strength with date, 1–5 skill dimensions, Lichess/Chess.com public accounts and time-control rating history, lesson/attendance materials and goals in accessible RTL/LTR sections.
- **WHEN** teacher B supplies teacher A's student/account/alias/rating-history UUID
- **THEN** no data or existence metadata SHALL leak and no mutation SHALL succeed.
- **WHEN** an MCP client requests student lists
- **THEN** list SHALL be paginated without a minimum search query and SHALL exclude guardian contacts, birthdates, sensitive notes and credentials by default.

### Requirement: Provider/API and alias error handling
- **WHEN** an API sync is requested without teacher opt-in or a scope/client rate budget
- **THEN** it SHALL be denied with a sanitized actionable error, not silently collect student data.
- **WHEN** a student alias matches an unrelated provider username
- **THEN** it SHALL not imply verified ownership or match the student without explicit teacher mapping.
