# Federation ratings: verified source and open gates

**Status:** Active. The shared website and delegated MCP expose optional linked identities, owner-entered unverified observations, and the latest applicable stored FIDE evidence. This is not a live source lookup. No production ingestion, provider writes, live transition, deployment or archive is approved by this evidence.

## Verified in source

- An exact saved FIDE ID is independent of the FIDE federation code, national-federation membership and educational strength. A teacher's suggested default and explicit none are distinct; the suggestion does not create membership. The shared services create/read/edit national registrations and record teacher-attributed FIDE or Israeli observations as unverified; they do not certify an identity or guess by name.
- [#163](https://github.com/itshak/ChessCoachPal/pull/163) separates current linked-ID evidence from bounded history and manual entries. Category reads consider Standard, Rapid and Blitz independently, preserve the old ID's evidence as history after a correction, refuse an unordered same-period edition tie or truncated evidence, and avoid presenting stale responses after an ID is saved. The Israeli source remains manual-only. Synthetic signed evidence covers owner scope, website/MCP agreement, identity correction, failed/stale re-read and no assessed-strength changes; this does not prove a date-effective report, delete workflow, or independent RTL behavior.
- [#164](https://github.com/itshak/ChessCoachPal/pull/164) adds an unwired, bounded synthetic contract for exact replay, evidence digest, correction lineage, incomplete/unknown coverage, explicit unrating versus missing, and stale last-known observations. It never reads a real FIDE file, calls a provider, writes a snapshot or runs a scheduler. The CI change only adds its six offline cases after the existing unit tests.
- Canonical provenance checks, immutable snapshots, provider/category registry, grants and tenant ownership are described in the [P0 freeze evidence](../archive/2026-11-21-consolidate-final-preproduction-saas-schema/proposal.md) and the [rating-provider boundary](../../../docs/RATING_PROVIDER_BOUNDARIES.md). The two reviewed source slices do not change the schema.

## Exact hosted evidence

| Change | Reviewed head | Merge | Passed checks |
| --- | --- | --- | --- |
| #163 | `6a5ef06a9a2efbf16a38f23c590ca06d40acf351` | `117a94d7c9a83d57b221d2c4fe539440990d9770` | [Security](https://github.com/itshak/ChessCoachPal/actions/runs/45327998804), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45327998866), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45327998831), [restore smoke](https://github.com/itshak/ChessCoachPal/actions/runs/45327998821), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45327998840) |
| #164 | `f7daaec945c95f08cd6f90b449c26495c9001825` | `729e571d58f59f55f8f004affd2eb0738fdb82dc` | [Security](https://github.com/itshak/ChessCoachPal/actions/runs/45332049990), [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45332049848), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45332049804), [restore smoke](https://github.com/itshak/ChessCoachPal/actions/runs/45332049855), [E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45332049743) |

## Still open

- Require separate approval for FIDE data access, actual format/coverage/revision evidence, terms for reuse and storage, and consent/minor-data policy before adapting or scheduling real retrieval. Confirm source authorization/completeness and owner/identity again before any real write. ICF automated access/terms and permitted lookup remain unverified; only manual input is available.
- Production format/parser, authorized import/write and monthly sync/backoff are not implemented. The synthetic fixture is not proof of a provider format, outage handling, or live sync.
- Date-effective evidence, its coach-only export and independent behavioral RTL acceptance are scoped below. Clearing the active FIDE ID is not deletion or provider-consent revocation; an automated provider-consent lifecycle still requires a separate policy decision. Real historical manual/online rating preservation, restored-copy reconciliation and one authorized final transition under [ADR-0017](../../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md) remain open. Hosted smoke checks are not proof of live migration.


### Date-effective stored FIDE evidence

The authenticated learner profile and the same delegated MCP operation can request
an inclusive effective date through today UTC. The result includes only saved,
published rows for the currently linked exact FIDE ID, with Standard, Rapid and
Blitz separate. A same-period correction with unverifiable order stays unknown.
A later retrieval of an older edition can count; this is not an audit of what
the app knew on that date or a reconstruction of the ID then linked. Former IDs,
Israeli manual evidence and future editions remain outside that projection.
The current summary, append-only history, assessed strength and default response
without a date are unchanged. There is no new external call or data write.

The dedicated signed date-review browser regression checks English and Russian
left-to-right and Hebrew right-to-left at a 390 px viewport. It submits the
localized control with Enter, checks the named live result and its text/date
direction, verifies recorded and missing category labels, and compares the
same disposable signed HTTP and MCP evidence value in each locale. This does
not exercise the private report, export, or every other federation control.

### Coach-only date-review download

A coach can explicitly download the review already displayed on the signed
learner profile as JSON. The same signed date request through MCP returns the
minimal evidence object. It records the selected date, ordered category
statuses, applicable rating/publication date and the provenance class, not the
learner, player, tenant, raw edition string, provider URL or historic identity.
The browser copies the reviewed result without another request. This does not
publish/share a report, change the workplace learner report or account export,
call a provider, or modify any persisted rating or school record.


### Explicit unlink

Clearing the optional FIDE ID through the signed profile form or the confirmed
MCP profile edit leaves the educator's strength and stored history untouched.
Current and dated reviews then return not-linked statuses and no export data;
the visible date result and button are removed. This does not erase history
or recall files already downloaded to the coach's device.
