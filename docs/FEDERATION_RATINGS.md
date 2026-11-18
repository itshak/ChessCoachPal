# Chess federation player IDs and rating evidence (unmerged draft)

**Status, 2026-11-19:** First identity and teacher-evidenced snapshot slice exists on draft PR #104 only. It is not accepted, merged, released or applied to a real database. Official automated FIDE/ICF lookup and verified publication imports are **not** enabled.

## Distinct identities and ratings

- `students.fide_id` is optional and independent of `fide_federation_code`. A FIDE identifier is not proof of active national federation membership.
- `students.national_federation_preference` can be null (inherit suggestion), `NONE` (explicitly no national federation selected) or a three-letter federation code. `teachers.default_national_federation_code` is only a form suggestion; it **never creates membership**.
- `student_federation_memberships` is a tenant-owned, revisioned entry with one student/federation tuple and a user-entered player ID. Its initial status is always `unverified`. Editing an ID resets source-match status. No website/MCP operation currently certifies membership.
- `student_rating_snapshots` has immutable and separately sourced FIDE Standard/Rapid/Blitz and Israeli national rating categories. Teacher-written observations have `source='teacher_manual'`, `verification_state='unverified'`, and optional observation/effective dates and external reference URL. Provider-published observations require a verified list version, content digest, official effective date and service-owned ingestion path; none is exposed as a manual write.
- Ratings are separated by provider and time control. They do not change the teacher's manually assessed 1–10 strength or any claimed chess mastery. Different sources are not silently averaged.

## Website and MCP sharing the same services

| Website interface | Delegated MCP operation |
| --- | --- |
| Student profile `PUT /api/students/:id` for FIDE identity, code and national preference | Existing `ccp_students_update` / profile update route |
| `GET /api/students/:id/federations` | `ccp_student_federations_get` |
| `POST /api/students/:id/federations` | `ccp_student_federations_link` |
| `PATCH /api/students/:id/federations/:membershipId` | `ccp_student_federations_update` |
| `POST /api/students/:id/federation-ratings` | `ccp_student_federation_ratings_record` |
| `GET /api/teacher/federation-default` | `ccp_teacher_federation_default_get` |
| `PUT /api/teacher/federation-default` | `ccp_teacher_federation_default_set` |

The student profile includes a new localized English/Hebrew/Russian federation panel for identity, teacher default, national player IDs and manual rating observations. The separate source-sensitive read model is used by both website and MCP. A foreign student's ID is not accessible. All writes require explicit teacher confirmation or an authenticated student-profile update; official-lookup credentials and unreviewed external polling are absent.

## External source feasibility / pending gates

- FIDE publishes official downloadable rating-list files and separate standard/rapid/blitz ratings, as confirmed on its official page: https://ratings.fide.com/download_lists.phtml. A future **list-level** importer should validate download content/hash, list date/category and FIDE ID before writing `provider_published` snapshots. Avoid per-student rapid polling and record one observation per official list/category, not repeated fake trend points. Confirm applicable FIDE data rights and privacy conditions before enabling automatic retrieval.
- The Israeli Chess Federation publishes national ratings and changes online; sources include https://www.chess.org.il/Players/PlayersRanking.aspx and https://www.chess.org.il/Players/PreviousRatingUpdates.aspx. An officially supported public API and permission for scheduled automated ingestion have not been verified. Keep ICF lookup **disabled** pending terms/robots/accessibility/consent/source-integrity review. Teacher-supplied references remain `unverified` evidence, not scraped certified ratings.
- FIDE IDs, national membership and minors' public information must be opt-in/approved for provider fetch; support source redaction, service-only bulk jobs, bounded retention, tenant isolation and audit. Do not infer identity by name similarity.

## Verification and release blockers

Source-local TypeScript, i18n and static website↔MCP inventory checks are available. `e2e/parity-federation-ratings.spec.ts` exercises cross-client read/write/replay, manual unverified evidence, federation time-control validation and negative owner/scope paths. The complete exact-branch GitHub CI/E2E/Compose/backup/restore matrix and merged-main recheck are still necessary. New tables and columns belong exclusively to the **single canonical baseline** per ADR-0017, and no live database should be mutated without a separate operator-approved final cutover. Formal OpenSpec tasks remain open until official adapters, anti-duplication, permissions, source contract and full acceptance are delivered.
