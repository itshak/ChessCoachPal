# Implementation checkpoint — optional federation identity and ratings (DRAFT)

The native optional FIDE/national identity, student federation membership, teacher default suggestion, immutable unverified FIDE/ICF rating snapshots, and shared website/MCP UI/operations are under review in draft PR #104. The one fresh-install SQL baseline and reviewed digest contain the schema; no separate staged compatibility migration or real database cutover has occurred.

Source candidates:
- `lib/server/student-federations-service.ts` validates tenant ownership, exact federation scope, optional FIDE identity, membership idempotency/revisions, and teacher-provided time-control-specific rating observations.
- `lib/server/student-profile-service.ts`, `lib/server/api-schemas.ts` and the existing MCP student profile tools support nullable FIDE ID, FIDE federation and national preference. `StudentFederationsPanel.tsx` shows and edits identities and evidence separately from educational strength.
- Website `app/api/students/[id]/federations`, nested update and federation rating routes, plus `app/api/teacher/federation-default` call shared services with equivalent new named `ccp_` tools. Exact acceptance case: `e2e/parity-federation-ratings.spec.ts`.
- Official FIDE monthly file imports, ICF site permissions, provider-adapter implementation, verified `source_matched` write path, deduplication and scheduled refresh are **not implemented**. Teacher-entered data remains unverified.

No OpenSpec complete/archived status is claimed. Final independent PR-head and merged-main gates, real-source feasibility and one operator-approved baseline cutover are still outstanding. More details: `docs/FEDERATION_RATINGS.md`.
