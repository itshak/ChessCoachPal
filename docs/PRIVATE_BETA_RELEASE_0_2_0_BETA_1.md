# Invite-only beta: OpenSpec disposition

[v0.2.0-beta.1](https://github.com/itshak/ChessCoachPal/releases/tag/v0.2.0-beta.1) is live at [ChessCoachPal](https://chesscoachpal.com). This release does not close every product proposal. This record separates
verified scope, omitted legacy migration for the fresh deployment, and
future acceptance. Do not archive a proposal based on this disposition alone.

| Active proposal | In invite-only beta | Still open |
| --- | --- | --- |
| Multilingual support | English, Hebrew RTL and Russian interface/catalog; localized narrow capture entry and recent signed evidence. | Full literal and assistive-technology coverage across the app, plus verified live ChatGPT/Claude clients. |
| Daily coach workflows | Exact workplace/date queue, preparation, attendance, homework, typed close, imported history evidence and scoped capture review. | Rating freshness depends on the provider policy; real-client acceptance is separate. |
| Professional coach workflows | Reviewed recurrence, day end, archived learner choices, private reports and access controls, posted monthly and fixed unposted advisory review. | Persistent intake, occurrence/participant forecasts, and remaining full-funnel acceptance are not evidenced. |
| Compensation and billing | Reviewed terms, explicit posting and allocation, corrections and canonical monthly settlement. | Production accounting acceptance beyond the beta; no automatic charges. |
| Workplace enrollment on import | A verified workplace is required; dated enrollment and saved evidence are used. | No old spreadsheet replay/remediation was requested. Any future live import is a new bounded review. |
| Temporal enrollment and credit lifecycle | Dated enrollment, protected archival/reactivation and transaction boundaries shared by website and MCP. | First redemption of pre-archive earned work remains a policy decision; receipt replay and no new consumption while archived remain unchanged. |
| Contacts | Contact roles, enrollment, payer identity and access control are distinct. | Additional exact multi-contact acceptance and remaining coordinated OpenSpec checks. |
| Scoped portal | Date- and relation-scoped grants, rotation and revocation; teacher-approved note sharing. | Concurrent revocation/ingress/audit retention and selected group-note/real-client checks; no old tokens or live invitations. |
| Online ratings | Confirmed on-demand evidence with separate provider transport and historical provenance. | Durable teacher consent and provider-bound activation/egress, scheduling, quotas and freshness. Background worker stays unwired. |
| FIDE and national ratings | Federation identity/provenance foundation and review boundary. | Official source authorization, verified licensing, quotas and provider integration. No production feed activated. |
| Brand and coach UI | Current localized keyboard-usable beta experience. | Comparison, explicit design choice and rollout; approval gate remains. |

For this clean reset the owner authorized preserving just the registered
Auth identity. Any checklist requiring migration, historical reconciliation,
or old token compatibility is not applicable to this release because the
one-account live state was independently verified. That does not
waive future authorization, reconciliation, or tests if an actual populated
deployment is migrated later. No teacher, learner, financial, or Storage
history is represented as migrated.

## Verified release evidence

Verified November 25, 2026 UTC.

- GitHub prerelease `v0.2.0-beta.1`, exact main `d4e6106ca699c464b75013b5dfa31220c1f4d261`. Source: [#228](https://github.com/itshak/ChessCoachPal/pull/228).
- Canonical baseline lock: 7e15f244c9f23d79430d42a3f4c3a8dedae8938c368b895f99b30364ddccf3fc
- The exact candidate passed [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45707204274), [signed browser and MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45707204471) (462 cases plus three repeats), [security](https://github.com/itshak/ChessCoachPal/actions/runs/45707204611), [Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45707204469) and [restore](https://github.com/itshak/ChessCoachPal/actions/runs/45707204401). Isolated production-shaped testing proved private synthetic login, public Auth signup denial and rejection of an invalid website access code.
- Exact [publication and deployment](https://github.com/itshak/ChessCoachPal/actions/runs/45710921891) passed. Independently verified live running image, new persistence mounts, canonical HTTPS site, Auth, Storage, OAuth discovery, unauthenticated MCP denial and closed public signup.
- Verified initial owner-only live Auth and zero old students or Storage objects. The authorized owner identity and sign-in verifier matched the staged identity; old app records, refresh tokens and sessions were not migrated.
- Initial owner sign-in reached Auth but hit a missing teacher-profile error on
  the dashboard. The clean target was then provisioned with the verified
  existing owner's minimal profile and default settings. The account holder
  confirmed that the dashboard opened. Public signup remained disabled and
  no former coaching data was reimported. The reset runbook now requires
  a signed dashboard check, not only an Auth health check.
- Live email acceptance and ChatGPT/Claude clients: not certified by
  synthetic browser or MCP tests.


## Next acceptance work

1. Complete portal privacy and revocation verification on synthetic records
   first. It protects learner data and is more urgent than new UI or automation.
2. Validate the signed-in coach's first lesson loop in the real clients and
   by keyboard, including Hebrew RTL at high zoom. Record the failures
   separately from the suites above.
3. Keep automated ratings and an official feed off until provider terms,
   explicit teacher consent, rate limits and audit behavior are reviewed.
   Keep the design comparison separate from production rollout.
