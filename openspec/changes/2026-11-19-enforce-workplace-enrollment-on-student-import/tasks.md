# Tasks: enrollment-aware student import

- [ ] Inventory deployed Coolify app/database image, schema version, import receipts, current enrollments, historical evidence, and affected students using read-only access; never log PII or credentials.
- [ ] Verify original spreadsheet source columns and original agent tool-call sequence, if authorized and available; document what was actually imported.
- [ ] Add workplace-aware column mapping, normalized rows, batch selection and explicit preview in UI and MCP; ensure multi-workplace ambiguity blocks commit.
- [ ] Implement atomic owner-scoped student + workplace_enrollments SQL import, with idempotency, existing-student resolution, concurrency and rollback guarantees.
- [ ] Preserve historical attendance as workplace-attributed evidence without automatically creating current enrollment.
- [ ] Expose workplace-filtered MCP roster, named enrollment list, student workplace reverse lookup and explicit current versus historical reporting.
- [ ] Integrate with pending contacts CRM change; remove inherited guardian/family dependencies at coordinated cutover rather than adding new ones.
- [ ] Add unit, SQL integration, browser/MCP parity, archive, ambiguity, replay, cross-tenant and up-to-ten-dates historical tests.
- [ ] Produce read-only production reconciliation and reviewed remediation SQL/plan; require backup, teacher approval and verification before production mutations.
- [ ] Run all CI gates and document green/red evidence; merge and archive only after review and tests, with live cutover separately approved.
