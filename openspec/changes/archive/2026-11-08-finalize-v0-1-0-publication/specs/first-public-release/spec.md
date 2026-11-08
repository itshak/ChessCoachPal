> **Superseded archive snapshot** (not an accepted/released specification). Successor: `openspec/changes/complete-v0-1-0-release-gates/specs/first-public-release/spec.md`.

# First public release — outstanding publication requirements

## ADDED Requirements

### Requirement: Publication is blocked until every release gate passes
ChessCoachPal MUST NOT publish version v0.1.0 until current-main GitHub Actions has verified fresh setup, production web/PWA, delegated synthetic MCP security, actual Docker Compose and second-installation data/file recovery, privacy and redistribution approval, **and** the maintainer has performed real ChatGPT and Claude delegated client acceptance as the last local prepublication test.

#### Scenario: Live clients are unavailable during development
- **WHEN** synthetic client GitHub checks pass but the maintainer has not performed the final real-provider test
- **THEN** development may continue and verified changes may be archived
- **AND** the package version SHALL remain 0.0.0; the public release MUST remain blocked.

#### Scenario: Candidate release would bypass privacy/client checks
- **WHEN** a readiness box is unchecked or a required automated gate fails
- **THEN** v0.1.0 tag creation and release publication SHALL be rejected.

### Requirement: Traceable public tag and sources
Only an approved reviewed bump on exact main commit SHALL trigger an annotated v0.1.0 tag and GitHub Release with dated changelog and automatic ZIP/tar.gz source archives.

#### Scenario: Successful v0.1.0 publication
- **WHEN** all conditions are satisfied and the release workflow is green
- **THEN** recorded tag, changelog, source archives and release URLs SHALL match the tested commit.
