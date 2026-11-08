# Proposed specification delta: conversational-lesson-capture

**Status: PROPOSED.** Current MCP creates a single-person or registered-group session, not an arbitrary three-student capture.

## Requirements and scenarios

### Requirement: Resolve multi-student narrative accurately
- **WHEN** teacher says, "Today I taught Armond, Shushana and David Zaruk from 13:00 to 14:30; we saw the Steinitz–Chigorin game in Classic Games 2, game 32"
- **THEN** `lessons_capture_preview` SHALL resolve three authorized stable student IDs through aliases, teacher-local date/timezone/workplace, an authorized exact study/chapter ID if available, one 90-minute teacher session, and per-student material history; it SHALL NOT write anything until confirmation.
- **WHEN** teacher confirms the preview
- **THEN** `lessons_capture_commit` SHALL atomically store one session, a frozen three-student roster, three attendance entries marked present (because all three were explicitly taught), and verified session/student material links, with exactly 90 teacher minutes, not 270.
- **WHEN** teacher did not say how students understood the lesson
- **THEN** individual comprehension/skill observations SHALL remain unknown, not inferred from attendance, study title or online ratings.
- **WHEN** the named students don't share a pre-existing group
- **THEN** explicit ad-hoc roster mode SHALL work without inventing permanent group membership or silently enrolling them in an unrelated workplace.

### Requirement: Date, time and scheduled fallback
- **WHEN** explicit 13:00–14:30 hours differ from the weekly slot
- **THEN** user-provided time SHALL take precedence, with visible conflicts/confirmation.
- **WHEN** the user omits hours and all named students match one uniquely applicable scheduled lesson occurrence
- **THEN** the preview SHALL suggest exactly that scheduled start/end with provenance, require normal confirmation and preserve timezone and exception rules.
- **WHEN** individual slots differ, multiple candidates exist, scheduled hours are missing or DST fold/gap is unresolved
- **THEN** the system SHALL ask a focused question rather than guess hours, offset, workplace or duration.
- **WHEN** "today" is used near a UTC day boundary
- **THEN** server SHALL resolve today in teacher/workplace configured IANA timezone and return a local calendar date plus explicit offset.
- **WHEN** an existing lesson occurrence already represents the activity
- **THEN** capture SHALL reconcile it and SHALL NOT double-count history, attendance or compensation because `lesson_slots/lessons` and `teaching_sessions` both exist.

### Requirement: Verified study identity and local availability
- **WHEN** "Steinitz versus Chigorin" matches more than one Lichess game or the selected study title is ambiguous
- **THEN** preview SHALL return candidate chapter/study IDs, ordinal and PGN tags for disambiguation, not invent a chapter or opponent side.
- **WHEN** the teacher explicitly supplies the authorized study and "game 32"
- **THEN** the service SHALL verify actual provider chapter ordinal 32 and immutable chapter ID before writing a verified material link.
- **WHEN** provider is offline but teacher confirms saving the lesson
- **THEN** local session MAY persist with a clearly marked unresolved/pending resource reference, not a falsely verified chapter.

### Requirement: Exact review, idempotency and isolation
- **WHEN** the client prepares a preview
- **THEN** database SHALL remain unchanged and preview SHALL have expiry, source/revision digest, missing facts and required confirmations.
- **WHEN** commit uses expired/stale preview, changed idempotency payload or wrong scope
- **THEN** it SHALL fail without a partial roster, attendance or material write.
- **WHEN** the same confirmed request retries with same idempotency key/payload
- **THEN** it SHALL return same receipt, one lesson and no duplicate records.
- **WHEN** teacher B provides a student, lesson, material or preview belonging to teacher A
- **THEN** it SHALL be denied without revealing teacher A's record.
- **WHEN** teacher changes session or student material link on website
- **THEN** later MCP reads SHALL reflect correct revision; historical frozen roster and verified observations remain protected.
