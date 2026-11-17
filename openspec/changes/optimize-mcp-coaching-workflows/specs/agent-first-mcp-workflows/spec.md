# Delta specification — agent-first MCP coaching workflows

**Status:** Proposed requirements for `optimize-mcp-coaching-workflows`. Add to applied specs only after implementation and verification.

## ADDED Requirements

### Requirement: Frequently requested coaching tasks SHALL be exposed as coherent domain workflows

The delegated MCP interface SHALL provide named, typed operations that accomplish common chess-coach outcomes through shared backend business services rather than forcing the AI to assemble a long sequence of independent record-level writes. Existing operations SHALL be reused wherever they already satisfy the outcome. The number of MCP tools SHALL NOT be reduced at the expense of authorized business capability.

#### Scenario: Completed group lesson with distinct observations
- **WHEN** a coach requests one completed 90-minute lesson for two identified learners, including a Lucena difficulty observed in only one learner
- **THEN** the workflow SHALL resolve both to stable teacher-owned identities and create **one** actual session with two participant records, the correct attendance and **90** instructor minutes, not 180
- **AND** the named learner's observation SHALL be distinct, the other's understanding SHALL remain unknown unless explicitly recorded, and read-back SHALL identify the completed session and student-specific evidence.

#### Scenario: Ambiguous name or schedule
- **WHEN** two learners match a nickname, a supplied full name and alias refer to one pupil twice, or omitted hours match multiple slots
- **THEN** the workflow SHALL refuse the unsafe commit, explain the ambiguity with bounded candidates and request clarification
- **AND** SHALL NOT create duplicate students, attendance, teaching time or invented dates.

### Requirement: Material creation, association and teaching evidence SHALL support one guarded workflow

A common “we introduced/taught this material” intent SHALL be executable through a typed service that resolves/reuses or creates the material, relates it to the intended session/participants and records independently distinguishable taught/assigned/linked evidence. Existing granular material catalog/edit/link/void tools SHALL remain accessible.

#### Scenario: New material during a lesson
- **WHEN** an authorized teacher previews then confirms that a new typed material was used in an identified completed lesson
- **THEN** the backend SHALL create/reuse the canonical material and save the correct session/student relationships and requested evidence in one consistent local transaction, returning durable IDs, status and a bounded receipt
- **AND** no student mastery SHALL be inferred from linking or covering the material.

#### Scenario: Collision, failure or external-provider side effect
- **WHEN** a duplicate title resolves ambiguously, an input schema is invalid, owner authorization fails or a local material/evidence write fails
- **THEN** the workflow SHALL reject with no orphaned local material/session/evidence records
- **AND** external provider writes SHALL use separately reviewed authorization and recoverable intent/reconciliation rather than an unsupported cross-provider atomicity guarantee.

### Requirement: Common workflow tools SHALL be specific and discoverable without hiding detailed controls

Each MCP operation SHALL have an accurate unique `ccp_<domain>_<action>` name, a concise description of the teacher goal, when to use it, its read/write effects, approvals, limits and its distinction from similar tools. Published input JSON Schemas SHALL be valid root objects, reflect canonical typed domain inputs and forward every supported field through dispatcher/service/storage/read-back.

#### Scenario: Agent needs a common task
- **WHEN** a compatible client searches for recording a completed lesson, viewing teaching history, correcting attendance or adding a material
- **THEN** an appropriately named and described task-oriented operation SHALL be available in the same `/mcp` catalog alongside necessary precise record-level operations
- **AND** tool definitions SHALL NOT direct the model to create low-level records that the server can safely coordinate.

#### Scenario: Client does not support deferred tools
- **WHEN** a client obtains the ordinary authorized `tools/list` catalog without progressive search
- **THEN** all authorized granular operations SHALL still be discoverable and callable
- **AND** core business capability SHALL NOT depend on a hidden generic executor, a separate MCP connection or an optional external skill.

### Requirement: Composed writes SHALL preserve deterministic authorization, confirmation and audit

Higher-level operations SHALL reuse the same teacher-scoped business service, permissions, plan entitlements, typed fields, revisions, idempotency and audit history as the website and granular MCP actions. Appropriate previews and explicit confirmation SHALL not be removed just to reduce call counts. External side effects require dedicated safeguards.

#### Scenario: Retry or stale commit
- **WHEN** an approved workflow commit is retried with the same idempotency key and unchanged payload
- **THEN** it SHALL return the same durable result without duplicate attendance, materials, credit charges or notifications
- **AND** a conflicting payload, stale revision, changed preview or foreign-tenant ID SHALL fail without a partial write.

#### Scenario: Guarded external action
- **WHEN** the workflow concerns sending family email, modifying payments/invoices, publishing Lichess material or permanent deletion
- **THEN** the server SHALL preserve appropriate scope, impact review, explicit teacher confirmation and failure reconciliation
- **AND** no broader “one-call” optimization SHALL bypass secure browser approval or silently perform an unrequested external action.

### Requirement: Workflow optimization SHALL be verified without mandatory paid model usage

Before marking a revised MCP workflow complete, CI SHALL validate exact tool discovery contracts, persisted owner-scoped results, independent website/MCP read-back, retry/failure behavior, the full parity registry and existing security/recovery gates. A documented before/after minimum safe tool sequence is an engineering proxy only; it SHALL NOT be represented as measured model token savings or live ChatGPT/Claude acceptance.

#### Scenario: Release candidate includes new composite tools
- **WHEN** a workflow composite, tool rename, schema or description is changed
- **THEN** automated contract tests SHALL exercise the actual authenticated `tools/list`/`tools/call` dispatcher, required and non-default fields, and independent canonical persistence
- **AND** strict website↔MCP parity, negative authorization and recovery checks SHALL remain green on the candidate and the accepted merged-main revision.

#### Scenario: Real client behavior is unknown
- **WHEN** a synthetic MCP workflow passes but no corresponding live ChatGPT or Claude session was tested
- **THEN** the implementation MAY be considered server-side verified as specified but SHALL NOT be advertised as client-certified on that provider/model/plan
- **AND** no subscription-model A/B benchmark SHALL be imposed as a prerequisite for the development change.
