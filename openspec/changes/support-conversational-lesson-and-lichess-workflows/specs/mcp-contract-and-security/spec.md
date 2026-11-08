# Proposed specification delta: complete MCP commands, source of truth and guards

**Status: PROPOSED.** See [full tool catalogue](../../tool-catalog.md) for the exact 28 existing and future names.

## Requirement: Agent can operate without knowing database implementation
- **WHEN** agent is asked "list all students"
- **THEN** `ccp_v1_students_list` SHALL return a cursor-limited teacher roster without requiring a search character or dropping results above 100.
- **WHEN** agent searches canonical Hebrew name or teacher-entered English aliases
- **THEN** resolver SHALL distinguish duplicates by stable ID, not guess a human from fuzzy matches.
- **WHEN** a tool is listed by MCP/OpenAPI
- **THEN** schema, scopes, readOnlyHint/destructiveHint/openWorldHint and actual operations SHALL match; future unimplemented tools SHALL NOT be advertised.
- **WHEN** teacher requests a multi-person lesson in one sentence
- **THEN** preview and commit SHALL bind exactly reviewed names/IDs, time and material, with local writes inside one transaction and provider writes in a separate recoverable intent.
- **WHEN** client lacks `coach:write`, grant is expired/revoked, or external Lichess `study:write` is absent
- **THEN** protected writes SHALL fail, without revealing tokens or private identifiers.
- **WHEN** arbitrary SQL, student password harvesting, secret export, uncontrolled bulk edits or child guardian contact access is requested
- **THEN** these capabilities SHALL remain absent from the general MCP contract.

## Requirement: Comprehensive synthetic regression
- **WHEN** changes are ready to merge
- **THEN** GitHub CI SHALL run unit/typecheck, actual synthetic Supabase RLS/browser E2E, material API mocks, DST and schedule tests, retries, anonymous denial, tenant isolation, self-host Compose and DB/file restore with zero real vendor credentials.
- **WHEN** all development tests pass on merged main and evidence is recorded
- **THEN** the implemented development change MAY be archived; this alone SHALL NOT mark real ChatGPT/Claude vendor acceptance or v0.1.0 release complete.
