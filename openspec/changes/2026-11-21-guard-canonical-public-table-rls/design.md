# Design — source-only RLS coverage guard

- Parse anchored `CREATE TABLE public.<table>` statements and anchored `ALTER TABLE public.<table> ENABLE/DISABLE ROW LEVEL SECURITY` statements from the authoritative canonical baseline. Ignore SQL comments, normalize identifier case and do not assume a fixed table count.
- Fail on a missing enable, any disable, duplicate creation, an RLS toggle referring to a missing public-table declaration or a baseline with no public tables. Never auto-generate policies, grants or DDL.
- Integrate in `pre1-schema-guard.mjs`'s repository path, not its independently used synthetic `canonicalSchemaErrors` test helper. This retains old fixture behavior and prevents bypass in the default/strict CLI check.
- Run positive and targeted negative `node:test` cases in the existing canonical guard test script.
- Limit claims to static text coverage: actual effective RLS, privileged database roles, cross-tenant queries, and populated-data migration are separate approval gates.
