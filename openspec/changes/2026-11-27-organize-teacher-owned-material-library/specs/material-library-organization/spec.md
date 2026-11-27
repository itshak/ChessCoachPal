# Material library organization

## ADDED Requirements

### Requirement: Teacher controls library organization
The system SHALL permit a teacher to organize owned materials in arbitrary nested collections and SHALL NOT require a predefined curriculum, template or classification to create a material or record a lesson.

#### Scenario: Start without a template
- **WHEN** a teacher skips optional library setup and creates a material
- **THEN** the material SHALL be searchable and visible in All materials and Uncategorized
- **AND** no mandatory collection or skill observation SHALL be created.

#### Scenario: Different teachers organize differently
- **WHEN** one teacher creates Endgames > Rook endgames > Lucena and another creates Club > Advanced course
- **THEN** each SHALL see only their own structure and SHALL be able to rename, reorder and move owned collections.

### Requirement: Multiple placements retain one canonical material
The system SHALL store organization independently of material kind, provenance, assignments and evidence; a material MAY appear in multiple collections without duplicate material identity.

#### Scenario: One position belongs to two collections
- **WHEN** a teacher places an existing material in Lucena and Advanced course
- **THEN** both views SHALL reference the same material ID and the same factual history
- **AND** removal from one SHALL NOT remove the other, archive the material or change any teaching record.

#### Scenario: Archive a collection
- **WHEN** a teacher confirms an impact preview for a collection subtree archive
- **THEN** affected collections SHALL be hidden from active navigation while their material identities, history and recoverable links remain
- **AND** materials with no active placement SHALL remain accessible in All materials and Uncategorized.

### Requirement: Starter structures are optional and editable
The system SHALL offer previewable optional starter structures and SHALL apply only teacher-approved collection definitions atomically; applied collections SHALL remain teacher-owned and independently editable.

#### Scenario: Customize a starter structure
- **WHEN** a teacher previews a chess topics template, renames Endgames and omits Openings, then confirms
- **THEN** only the approved structure SHALL be created
- **AND** no materials, assessments, assignments or provider changes SHALL be created
- **AND** a retry with the same request ID SHALL return the same result without duplicates.

### Requirement: Suggestions do not take ownership away from the teacher
The system SHALL distinguish a proposed classification from an authorized mutation, SHALL prefer existing teacher collections and SHALL allow leaving materials uncategorized.

#### Scenario: Agent proposes an organization
- **WHEN** a coach imports a study chapter without requesting categorization
- **THEN** the import MAY offer collection suggestions but SHALL NOT create or assign collections without authorization
- **AND** core capture SHALL remain available without classification.

#### Scenario: Ambiguous or exact path
- **WHEN** a coach requests placement in a name matching multiple collections
- **THEN** the system SHALL return qualified paths for selection and make no ambiguous mutation.
- **WHEN** the coach explicitly requests placement in a uniquely resolved existing path
- **THEN** authorized placement MAY proceed with ordinary mutation safeguards without an additional confirmation solely for using MCP.

### Requirement: Organization is tenant-safe, consistent and accessible via MCP
The system SHALL enforce ownership, acyclic trees, unique memberships, revision and replay guards in shared services and approved persistence; all new teacher business operations SHALL have equivalent authenticated web and MCP access.

#### Scenario: Concurrent tree moves
- **WHEN** concurrent attempts would form a cycle or reference a foreign tenant
- **THEN** no invalid tree or partial change SHALL persist
- **AND** the caller SHALL receive a typed conflict or authorization-safe result.

#### Scenario: Connected study changes or becomes unavailable
- **WHEN** a locally cataloged Lichess material is categorized or its provider becomes unavailable
- **THEN** organization SHALL remain local and existing authorized local history SHALL remain accessible with source freshness limits
- **AND** no provider write or fabricated teaching status SHALL follow from classification.

#### Scenario: Export and restore
- **WHEN** a teacher exports and restores the library organization through approved flows
- **THEN** collection hierarchy and memberships SHALL reference the correct canonical materials
- **AND** duplicate membership, cycles and foreign references SHALL be rejected without damaging existing evidence.
