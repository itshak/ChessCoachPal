# Delta: Baseline-first live transitions

## ADDED Requirements

### Requirement: The current fresh-install baseline SHALL be authoritative
Every schema-changing application revision SHALL represent its final app-owned schema, grants, RLS and RPCs in the canonical baseline. Additional transition files SHALL NOT be required for an empty installation to function.

#### Scenario: New teacher on clean Supabase
- **WHEN** an empty Compose/Supabase database installs the current baseline and seeds normal defaults
- **THEN** teacher signup, student/group/private lessons, permissions, website and MCP operations SHALL function without executing any live transition file.

### Requirement: Existing real records SHALL transition once without silent data loss
An authorized deployment update SHALL run its reviewed versioned transition on the current production schema, after verified backup/restore, preserving all current teacher-owned history and access records and converging to the target baseline contract.

#### Scenario: Historical family and finance records survive a breaking redesign
- **WHEN** a populated restored fixture with archived students, guardian invoices and portal permissions is transitioned
- **THEN** student/financial history and authorized relationships SHALL remain attributable and counts reconcile, with no destructive reset or unreviewed implicit grants.
- **AND** an already-recorded transition SHALL not replay and produce duplicate data.

### Requirement: Transition scope and drift SHALL be CI-guarded
The schema guard SHALL reject unlisted transitions and test both fresh-install and previously populated data paths, including RLS, grants, idempotency and foreign-owner denial.

#### Scenario: Developer adds a new SQL file only
- **WHEN** a schema change introduces a new transition without updating the canonical baseline and reviewed manifest
- **THEN** CI SHALL fail with a specific baseline/transition policy error.
