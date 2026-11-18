# Coordinated contacts schema — staging only

`contacts-schema.sql` is a **reviewable design artifact**, not a deployable migration. Do not copy it into `supabase/migrations` or apply it to a database before the coordinated website/MCP, financial and portal cutover is implemented and validated. The existing guardian tables and invoice keys remain authoritative.

The schema establishes tenant-qualified relationship FKs, independent contact and debtor records, optional per-student communication permissions, and non-public guardian transition provenance. Its final form must include a reversible, idempotent data mapping, explicit invoice debtor mapping, public portal scoping and verified RLS policies before inclusion in the canonical baseline and an ordered live migration.

## Required reconciliation before approval

- Capture old and new row counts and stable IDs per teacher; assert one primary contact and one billing account per migrated guardian, and exactly one secondary contact when substantive secondary data exists.
- Assert every pre-existing `students.guardian_id` yields a linked contact, and zero-contact students remain possible.
- Assert every historical invoice retains its ID, amount, currency, status, paid timestamp, payment references, invoice items, receipts and original debtor mapping.
- Assert event RSVPs and email delivery records retain event, status, recipient and provenance, without granting access based solely on contact membership.
- Verify no cross-tenant relationships, no newly authorized portal access, and no unauthorized contact email disclosure.
- Restore an isolated production-shaped backup; run both fresh and upgrade convergence, authenticated UI and MCP E2E, strict parity, security, Compose and restore tests.

**Status:** staging design only. This proposal remains open and must not be archived or deployed.
