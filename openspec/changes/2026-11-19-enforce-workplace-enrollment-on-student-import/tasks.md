> **2026-11-21 schema-ownership handoff:** All outstanding physical DDL, source schema/type/RLS changes and schema-generated regression tasks in this checklist are now tracked under the **single [consolidated schema P0](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/tasks.md)** (ADR-0019). Keep this proposal's functionality, UI, MCP and acceptance tasks open until independently verified. Historical SQL implementation instructions here are not independent migrations. Do not mark work complete solely because merged code exists.

# Tasks: enrollment-aware student import

- [ ] Inventory deployed Coolify app/database image, schema version, import receipts, current enrollments, historical evidence, and affected students using read-only access; never log PII or credentials.
- [ ] Verify original spreadsheet source columns and original agent tool-call sequence, if authorized and available; document what was actually imported.
- [x] Add workplace-aware column mapping, normalized rows, batch selection and explicit preview in UI and MCP; ensure multi-workplace ambiguity blocks commit.
- [x] Implement atomic owner-scoped student + workplace_enrollments SQL import, with idempotency, existing-student resolution, concurrency and rollback guarantees.
- [x] Preserve historical attendance as workplace-attributed evidence without automatically creating current enrollment.
- [x] Expose workplace-filtered MCP roster, named enrollment list, student workplace reverse lookup and explicit current versus historical reporting.
- [ ] Integrate with pending contacts CRM change; remove inherited guardian/family dependencies at coordinated cutover rather than adding new ones.
- [x] Add unit, SQL integration, browser/MCP parity, archive, ambiguity, replay, cross-tenant and up-to-ten-dates historical tests.
- [ ] Produce read-only production reconciliation and reviewed remediation SQL/plan; require backup, teacher approval and verification before production mutations.
- [x] Run all source CI gates, verify the merged implementation and document [exact source evidence](SOURCE_ACCEPTANCE.md).
- [ ] Archive only after the remaining coordinated Contacts CRM and operator acceptance criteria are resolved. Live cutover requires separate approval under ADR-0017.
