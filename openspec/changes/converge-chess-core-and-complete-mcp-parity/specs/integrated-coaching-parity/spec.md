# Integrated chess-core and retained website ↔ MCP parity — delta specification

## ADDED Requirements

### Requirement: Canonical source reconciliation precedes parity acceptance
The implementation SHALL reconcile the existing functional parity stream with the student-centered model, including the proposed PR #48 typed materials and PR #49 assignment/navigation functionality, before claiming full parity. It SHALL select one canonical writer/source of truth for each student, contact, actual lesson, scheduling rule, material, homework, report and financial calculation. Previously supported data and business features SHALL NOT disappear merely to lower parity workload.

#### Scenario: Canonical fresh-install lessons
- **WHEN** a coach records private and group lessons on the current new schema
- **THEN** both SHALL be written through one occurrence service
- **AND** teacher minutes and participant evidence SHALL not be duplicated
- **AND** website and MCP SHALL show identical factual results
- **AND** no import from older development schema SHALL be required.

#### Scenario: Concurrent candidate branches
- **WHEN** the integration agent combines PR #44, typed-material PR #48 and stacked homework PR #49
- **THEN** it SHALL resolve schema/service/API/test conflicts explicitly with one canonical implementation per domain
- **AND** no working retained billing, contact, event, material, historical or MCP operation SHALL be silently overwritten
- **AND** the final source changes and dependency ancestry SHALL be documented.

### Requirement: Retained optional business features remain complete and parity-safe
Invoices, credit packages/redemptions, manual payment, PDFs, ledger exports, checkout, events, guardian/contact workflows, settings and communication actions that remain supported by the website SHALL have equivalent authorized MCP access via shared domain logic, including identical entitlement/permission handling and required approvals. Their optional or professional nature SHALL NOT excuse missing MCP operations. Actual card and credential entry MAY require a secure browser handoff.

#### Scenario: Professional coach creates and settles an invoice
- **WHEN** an authorized coach generates an invoice from a canonical teaching record, inspects its PDF and records an approved settlement through one interface
- **THEN** website and MCP SHALL show matching invoice lines, period/rate calculations, payment status and ledger history
- **AND** retries or concurrent operations SHALL NOT double-create charges, receipts or emails
- **AND** the provider card-entry page SHALL NOT disclose payment secrets to the model.

#### Scenario: Optional module inaccessible by entitlement
- **WHEN** a teacher's entitled features do not include a supported optional module
- **THEN** website and MCP SHALL enforce the same module access policy
- **AND** no unentitled mutation or sensitive read SHALL succeed by calling MCP directly.

### Requirement: Student-first contacts do not sacrifice guardian security
A teacher SHALL create an independent student with no required family or guardian. A student MAY have optional purpose-limited contacts, guardians and a separately authorized payer. Guardian, payer and portal functions SHALL use the current website/MCP domain model without earlier family-schema converters.

#### Scenario: Adults and shared junior contact
- **WHEN** a coach adds an adult with only a name and later adds two juniors linked to one consented guardian
- **THEN** no fictitious family SHALL be created for the adult
- **AND** the juniors SHALL keep distinct student, lesson and training records
- **AND** the guardian and payer SHALL only see information their independent permission grants authorize through either applicable interface.

### Requirement: One teaching occurrence is authoritative for time and materials
The system SHALL store one real teaching occurrence per group/private/ad hoc lesson with immutable prior roster revisions, per-student attendance, observations, material coverage and one teacher duration. Recurring slots SHALL be schedule intent, not duplicate completed lesson records. Local time, DST and workplace holiday policies SHALL be resolved with explicit ambiguity instead of guessed event times.

#### Scenario: One multi-student lesson, one teacher duration
- **WHEN** a teacher confirms a 90-minute lesson for three students from a schedule or conversational preview
- **THEN** one occurrence SHALL be written with three frozen participants and individual evidence
- **AND** reports and invoice calculations SHALL count at most 90 teacher minutes for that occurrence
- **AND** identical retries across website/MCP SHALL not create a second lesson.

#### Scenario: DST or holiday conflict
- **WHEN** a requested local recurring lesson lands on a nonexistent or ambiguous local clock time or a configured workplace holiday
- **THEN** both interfaces SHALL report the same explicit conflict/possible resolution and perform no unapproved write
- **AND** correcting future occurrences SHALL NOT rewrite completed history or silently drop students.

### Requirement: Typed chess materials and homework have one durable identity
Only the teacher-owned `learning_materials` catalog SHALL store chess game, puzzle, drill, study chapter and link materials with typed relations. The former `chess_learning_resources` catalog and material-ID mapping bridge SHALL NOT exist in the final schema. Assignments, student attempts, reviews and independent assessments SHALL remain distinct. Every editable typed field, association, status change, correction and search/filter SHALL have website and typed MCP parity.

#### Scenario: Extract a puzzle and assign it to one student
- **WHEN** a coach attaches a puzzle to a source game and assigns the puzzle to one of two pupils in a shared lesson
- **THEN** the game and puzzle SHALL remain separate materials with a typed relationship and retained provenance
- **AND** only the designated pupil SHALL have that assignment
- **AND** neither the other pupil's history nor either pupil's mastered skill rating SHALL change without an explicit teacher-authorized operation.

#### Scenario: Invalid or cross-teacher material
- **WHEN** a malformed PGN/FEN, a mismatched material subtype, a forbidden material relation or another teacher's ID is submitted
- **THEN** both interfaces SHALL reject the operation without a partial root/subtype record, secret disclosure or side effects.

### Requirement: Factual lesson briefing remains available offline
An authenticated coach briefing SHALL deterministically show source-linked recent sessions, actual material stages, pending reviews, goals and verified observations for a student, marking unknowns rather than fabricating mastery or comprehension. Website and MCP SHALL use the same service and remain useful when a remote chess or AI provider is unavailable.

#### Scenario: Prepare for Daniel's next lesson
- **WHEN** the teacher requests a briefing for Daniel after a shared lesson and individual homework assignment
- **THEN** both interfaces SHALL return the same cited taught material, Daniel's pending work and authorized observation
- **AND** unreviewed results or unknown comprehension SHALL be marked unknown
- **AND** retries of the original lesson/assignment commit SHALL not duplicate records.

### Requirement: Supported Lichess publishing is safe, reviewable and typed
If the website exposes study/puzzle publishing, MCP SHALL expose the equivalent approval-based workflow, and returned provider chapter identities SHALL reconcile to typed study/puzzle materials. Image interpretation is a *proposal*, not a verified full FEN. Side-to-move, castling, en-passant and move counters SHALL require trusted input or explicit teacher review. Provider errors, rollover, retries and permissions SHALL be handled without duplicating public writes or inventing success.

#### Scenario: Photo to approved Lichess study chapter
- **WHEN** a teacher provides a chessboard photo, reviews an editable full FEN and approves a puzzle PGN publish
- **THEN** the provider SHALL receive a valid PGN with reviewed state and correct scope
- **AND** the teacher SHALL receive a provider-backed or clearly pending result linked to the canonical materials catalog
- **AND** an uncertain photo, denial, full study or timeout SHALL NOT silently publish an unverified position or duplicate chapters.

### Requirement: Every retained teacher business field/action has proven MCP parity
Every website-visible teacher business read, create, update, clear, delete, history correction, export, report, material or plan action SHALL be represented by a discoverable typed authenticated tool on the existing `/mcp` gateway, invoking the same teacher-scoped business service. Each fully verified route SHALL have real cross-interface persisted-state equality, tenant isolation, permission handling and appropriate replay/stale/error evidence. Sensitive credentials, OAuth grants and payment-card input SHALL use narrowly documented browser approval handoffs; ordinary business fields SHALL NOT be declared web-only.

#### Scenario: New chess material edit added to website
- **WHEN** a developer adds a website-editable puzzle field or training-goal status
- **THEN** the same integration SHALL expose the typed MCP action and readback and negative tests
- **AND** source audit and strict release validation SHALL reject an unimplemented or untested mapping.

#### Scenario: Foreign, read-only or revoked MCP request
- **WHEN** a model client references another teacher's student, uses a revoked grant, lacks write scope or supplies a stale revision
- **THEN** mutation SHALL be denied without data loss or private record disclosure
- **AND** website/MCP behavior SHALL not diverge due to an independent validator.

### Requirement: Coherent implementation batch precedes comprehensive synthetic acceptance
The applying agent SHALL perform dependency-ordered integration and gap closure as a coherent implementation batch, authoring tests alongside code, and SHALL defer the complete GitHub synthetic acceptance campaign until implementation and test matrix are ready. Infrequent unverified checkpoint commits MAY preserve work but SHALL not count as acceptance; the candidate must ultimately run all required workflows. Failures SHALL be fixed in grouped patches and reverified on one final exact SHA.

#### Scenario: Many small source gaps found
- **WHEN** the agent detects many remaining route and field gaps
- **THEN** it SHALL close them in the canonical integrated source before launching the full CI/E2E/security/Compose/restore campaign
- **AND** it SHALL not repeatedly call a narrow passing unit test or a small CI run "full MCP parity"
- **AND** a failed final suite SHALL remain a blocker until fixed and rerun.

### Requirement: Exact audited evidence governs acceptance, never checklist arithmetic
The final integrated repository SHALL enumerate every actual teacher route/page/component/direct-write/field/action and every required scenario. Existing 93 historical scenarios SHALL remain mandatory if their supported behavior remains, and additional student-centered scenarios SHALL be tracked as separate evidence requirements. A complete route status must have a real named executable test; registry edits, passing generic CI and structural tool-name existence alone SHALL NOT constitute acceptance. The strict gate SHALL pass on the exact final merged-main SHA.

#### Scenario: Registry and checklist disagree
- **WHEN** route inventory and prose disagree on complete/partial counts
- **THEN** the agent SHALL reconstruct the correct counts from actual source and executable evidence, explain the change and retain the stricter unresolved status until proven
- **AND** it SHALL NOT mark `partial` as `mcp`, remove a supported teacher route, or check a historical scenario without a passing named browser/MCP test merely to make the strict gate green.

#### Scenario: Acceptance after final integration
- **WHEN** one final candidate has every retained route fully verified, all existing 93 plus new scenarios evidenced, and full synthetic GitHub checks passing
- **THEN** the approved change MAY merge to main and all applicable strict and synthetic checks SHALL run again on the merged-main SHA
- **AND** OpenSpec tasks and archive decisions SHALL be updated only for truly completed scopes
- **AND** real ChatGPT/Claude client testing and official v0.1.0 publication SHALL remain separate explicit release gates.
