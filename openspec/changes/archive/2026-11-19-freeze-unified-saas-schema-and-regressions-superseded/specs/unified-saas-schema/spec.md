> **Superseded planning delta; NOT implemented:** This historical delta was incorporated into [the consolidated schema spec](../../../../2026-11-21-consolidate-final-preproduction-saas-schema/specs/final-saas-schema/spec.md), under ADR-0019. Do not treat the two as independent or current migration workstreams.

# Unified SaaS schema foundation

## Requirements

### Requirement: Single pre-v1 canonical target
The system SHALL define every approved persisted field, table, FK, index, RLS policy and grant required by the active OpenSpec proposals in the one canonical baseline before implementation of their remaining functionality. The system SHALL NOT use per-feature production migrations or pre-v1 compatibility layers.

#### Scenario: Fresh database
**WHEN** a disposable empty database installs the canonical baseline **THEN** all required domains install and the schema inventory matches the freeze manifest without duplicate ledger or rating evidence models.

### Requirement: Tenant isolation is database-enforced
All tenant-owned data SHALL be owned by an authenticated teacher UUID and guarded by RLS and tenant-aware relationships. Workplaces SHALL NOT become tenants or grant cross-teacher access.

#### Scenario: Cross-tenant linked-resource injection
**WHEN** teacher A attempts to read, modify or link teacher B's student, contact, lesson, rating, portal grant or payment **THEN** the database and application deny the action, including via MCP and privileged entry-point reviews.

### Requirement: No schema-induced regressions
Existing supported website and MCP workflows SHALL continue to operate on the finalized schema with equal business semantics and independently verified persistence.

#### Scenario: Regression suite
**WHEN** the schema phase is proposed for acceptance **THEN** exact-head CI, E2E, security, fresh Compose and backup/restore succeed with negative tenant and ledger cases, and downstream features remain explicitly unimplemented until their own proposals.

### Requirement: Live-data safety
A source schema freeze SHALL NOT authorize production reset, migration or release. The single final live transition SHALL require separate operator approval, verified backup and independent historical financial, portal and Storage reconciliation under ADR-0017.
