# Scoped Student and Contact Portal: verified source

[PR #139](https://github.com/itshak/ChessCoachPal/pull/139) merged at [`bd68a91`](https://github.com/itshak/ChessCoachPal/commit/bd68a9101f9689aa7b2388f4206522311ffead31). Tested head `3e0b545b0ff8892051b1038df5adabea5c7378c3` and merged main share tree `419239c9ad9ee2b1b9a5b14eeb17978830e59092`. All five exact hosted checks passed: [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45158901330), [security](https://github.com/itshak/ChessCoachPal/actions/runs/45158899541), [synthetic backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45158899515), [fresh Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45158899683), and [signed E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45158899535). This evidence does not authorize or verify an operational cutover.

- [#136](https://github.com/itshak/ChessCoachPal/commit/d6a7c9dee206f9c11c7d59245458298bdf3af47a): exact authorized invoice attribution using complete bounded line/payment evidence; current noncancelled enrollment inclusive on the teacher's local date, multiple periods supported, prior approved in-scope notes remain visible only while the grant is current. Signed guest tests cover rotation, expiry, revocation and privacy headers on the page.
- [#137](https://github.com/itshak/ChessCoachPal/commit/605d58edc9098516f30af6f21390a0fc9303d973): prepaid purchase invoices show only date, amount and payment status for the exact canonical purchase, learner, original workplace and explicit billing account. Draft, mixed, missing, mismatched and archived-learner guest access fails closed; owner records remain. No remaining/usable credit balance, consumption, expiry or spending authority is exposed.
- [#138](https://github.com/itshak/ChessCoachPal/commit/5020e7a9850abb8ea69bbae85d1d65c4a8919521): simultaneous distinct grants for one learner prove mother's private calendar, school calendar/RSVP and sponsor's authorized prepaid purchase. Link removal or contact archival stops only the affected access. Exact ICS session IDs verify separation. Ordinary ICS, cancellation and RSVP responses have privacy headers in signed scenarios; valid and denied guest pages use neutral localized metadata.
- [#139](https://github.com/itshak/ChessCoachPal/commit/bd68a9101f9689aa7b2388f4206522311ffead31): website and MCP share read-only renewal review and explicit same-scope expiry extension at the reviewed revision. The old token is cleared atomically with renewal; browser-only reissue requires separate approval. Expired, revoked and inactive scopes cannot renew. A lost acknowledgement retries the exact latest request, not permanent historical receipts. No raw bearer in normal metadata or MCP. Guest sent invoices with an outstanding balance either retain an existing trusted invoice-specific checkout link where eligible or display “Contact your coach to arrange payment for this invoice.” No new checkout, payment, bank instructions, global QR or provider changes.

## Signed group-note and revocation regression

The signed website/MCP scenario in
[`scoped-portal-group-note-revocation.spec.ts`](../../../e2e/scoped-portal-group-note-revocation.spec.ts)
was independently repeated with two isolated synthetic teachers. It proves
two original group participants and three approved notes are stored; a guest
sees only the selected learner's approved body. The other learner, their
note, the approved group-wide note, and teacher-private text are absent.
Reads started before revocation may finish, but cannot disclose content
outside their original scope. New page, calendar and cancellation requests
after confirmed revocation are denied without writing attendance.
The separate [canonical lock test](../../../scripts/portal-revocation-concurrency.py)
observed each transaction actually waiting on the other transaction's row
lock. Revocation first produced no attendance change. Cancellation first
produced exactly one accepted cancellation, then revoked access. A new
request after committed revocation was denied in both cases.

The [disposable ingress test](../../../scripts/check-portal-ingress-rehearsal.sh)
used two Traefik 3.6 instances and one Redis budget. A request to the portal
page via the first instance exhausted the shared limit and a calendar
request via the second received 429. Control paths appeared in the proxy
log; neither synthetic portal path did. This verifies the isolated
configuration, not the live proxy chain, storage of log records by another
operator or a distributed setup already deployed.

References: [Traefik v3.6 shared rate limiting](https://doc.traefik.io/traefik/v3.6/reference/routing-configuration/http/middlewares/ratelimit/)
and [per-router observability](https://doc.traefik.io/traefik/v3.6/reference/routing-configuration/http/routing/router/).

## Remains open

- The process-local failed-token limiter and verified no-store/no-referrer application responses are not proof of distributed ingress limits or production access-log redaction. Review actual proxy trust and token redaction without inspecting real secrets here. Durable access audit/last-used needs a separate privacy, retention, authorization and governed persistence review; issued or renewed is not evidence of use.
- A configurable invoice-specific manual payment instruction or QR is not implemented. If later needed, review purpose/recipient/venue, amount and outstanding state; do not expose teacher-global banking data by default.
- No populated legacy data, old bearer links, real invoices, credentials, receipts, access logs or tenant mappings were reviewed. Under [ADR-0017](../../../docs/adr/0017-pre-v1-single-final-cutover-no-compatibility.md), operator-specific authorization and an independent verified off-host restore must precede deliberate reconciliation and explicit replacement/revocation of old broad links. Preserve Auth, Storage, finance and RSVP history. No live finance, notification, public release or deployment is inferred.
