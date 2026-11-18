# Canonical-baseline-and-final-cutover Specification

## Purpose
A pre-v1 installation has exactly one canonical current schema, and the **future production deployment has one final operator-controlled cutover**. ADR-0017 supersedes the earlier per-feature migration policy in ADR-0015. Security and data recovery are independent of compatibility guarantees.

## Requirements

### Requirement: One current baseline SHALL bootstrap all features
Every implemented schema change SHALL update `supabase/migrations/20261107000000_chesscoachpal_baseline.sql`, associated grants/RLS, generated types, seeds and tests. An empty installation SHALL NOT require incremental historical schema upgrades, compatibility views or dual writers.

#### Scenario: A new coach starts on fresh Supabase
- **WHEN** the final baseline is installed into an empty database
- **THEN** registration, teacher-owned lessons, contacts, workplaces, financial records, reports and website/MCP paths SHALL operate using only the current schema.

### Requirement: No pre-v1 backward compatibility SHALL be shipped
The final server SHALL NOT provide old CogNote, guardian/Family, Studio, historical tool/API aliases or unscoped portal token routes solely for an earlier version. Website and MCP SHALL expose the same current teacher operations.

#### Scenario: A removed household token is presented after final cutover
- **WHEN** an old household portal token is submitted after final cutover
- **THEN** it SHALL NOT authenticate as a new scoped sharing grant, disclose records or silently mint access. Only explicit teacher-approved new scoped grants are valid.

### Requirement: One final production data cutover SHALL be chosen
Before any remaining planned pre-v1 change is deployed to the real database, the operator SHALL explicitly select one of: **(A)** one reviewed forward source-to-final transformation for the observed installed schema, or **(B)** verified off-host backup/export, fresh baseline and deliberate reimport. Partial per-feature migrations SHALL NOT be applied to the real deployment under this roadmap.

#### Scenario: The owner selects a fresh rebuild
- **WHEN** a restored backup has been verified and the chosen data set/reimport has been rehearsed and approved for the exact production target
- **THEN** the target may be provisioned from the final baseline, selected records reimported, and the app cut over once, with an auditable record of exclusions, privacy grants and recovery path.

#### Scenario: No production authorization exists yet
- **WHEN** source code, synthetic migration CI or an OpenSpec change passes tests
- **THEN** no live reset, migration, token revocation, deployment or deletion SHALL occur without the separate target-specific operational approval.

### Requirement: Final-cutover acceptance SHALL test current contracts and ownership
The release gate SHALL test fresh-install DDL, current website/MCP parity, cross-tenant isolation, scoped portal access, data-export/reimport fidelity, lesson-counting and billing invariants, exact-source CI, E2E, Compose, and backup/restore. Synthetic historical migration fixtures are optional dev evidence, not a production compatibility requirement.

#### Scenario: Selected teaching records are reimported
- **WHEN** a teacher-approved import contains archived students, dated group attendance, materials, invoices or actual payments
- **THEN** selected data SHALL retain correct attribution, dates, tenant isolation and business semantics; absent old portal access SHALL never imply automatic new access.
