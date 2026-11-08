# Archived accepted change delta — v0.1.0 agent coaching tool coverage

## ADDED Requirements

### Requirement: Website-parity for planned coaching tool operations
The teacher-delegated MCP catalogue SHALL provide safe typed commands for creating/editing students and workplaces, updating enrollment/groups, scheduling/rescheduling/canceling sessions and handling approved learning observations/resource links. Each implemented command SHALL use the canonical teacher-owned service and respect the same rules as the website.

#### Scenario: Synthetic agent schedules a lesson
- **WHEN** a teacher-scoped synthetic MCP client schedules a group session in a real authorized workplace
- **THEN** the action SHALL create only teacher-owned records with frozen attendees and correct timezone semantics
- **AND** the teacher SHALL be able to inspect and correct the lesson in the website.

### Requirement: Safe, retryable scoped mutations
Every exposed tool write SHALL require stable targets, checked revision where applicable, idempotency and a privacy-minimized audit receipt; unresolved names SHALL fail without writes. Higher-impact bulk/destructive commands SHALL require verified payload-bound, expiring confirmation or not be exposed.

#### Scenario: Ambiguous student or concurrent edit
- **WHEN** two records share a name or a newer website revision exists
- **THEN** the tool SHALL return NEEDS_RESOLUTION or CONFLICT and SHALL NOT guess/overwrite.

### Requirement: Automated, vendor-independent contract acceptance
GitHub Actions SHALL validate each exposed tool with fresh synthetic database and OAuth/MCP calls, two-teacher RLS/authorization isolation, retries, delegated scopes and website correction parity, **without** requiring real ChatGPT or Claude accounts.

#### Scenario: Vendor unavailable during development
- **WHEN** neither AI provider can be reached or logged into
- **THEN** all implementation and security tests SHALL still run on GitHub and development acceptance SHALL remain possible
- **AND** real-provider interoperability SHALL be reserved for the separate final local v0.1.0 release gate.

**Applied:** Merged [PR #13](https://github.com/itshak/ChessCoachPal/pull/13) / main [e0d99bc](https://github.com/itshak/ChessCoachPal/commit/e0d99bc5429dbd639b6a8a3a613c34f8610ebc59). Passing main GitHub CI/E2E/security/Compose/restore evidence in docs/STATUS.md; real ChatGPT/Claude release-only test is still pending.\n