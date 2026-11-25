# Invite-only beta: release candidate checklist

This checklist applies to the existing private beta. It does not authorize a
new public signup flow, deployment, live database change, or invitation.
Passing synthetic checks is not the same as accepting a populated deployment.

## One source batch, independent operator cutover

| Area | Include for this candidate | Do not promise or enable |
| --- | --- | --- |
| First coaching loop | Prepare or capture one school-group session, resolve exact owned learner names, review and confirm attendance, record teaching evidence, and read it back across authenticated website and MCP. Test keyboard focus and a narrow viewport, including Hebrew RTL. | Persistent capture inbox or recovered unsaved browser text. A preview is not a saved lesson. |
| Workplace and contacts | Use dated enrollment and exact workplace scope. Keep contact roles, billing identity and portal access separate. Verify teacher and second-tenant isolation. | Legacy credential or portal link reuse, public signup, live invitations, bulk messaging. |
| Billing | Read current posted monthly settlements separately from the fixed-period advisory review. Explicitly validate approved terms and amounts at posting. Verify one group counts once and replay does not post twice. | Automatic billing, real charges, payment provider activation, unposted session earnings or participant charge forecasts. Do not infer received money from an obligation. |
| Ratings and UI | Use existing reviewed rating lookups and stored evidence. Keep current keyboard-accessible, localized UI. | Background rating synchronization, live official feed ingestion and a redesigned interface are not required by this narrow candidate; those OpenSpecs remain open. |

## Source and synthetic rehearsal

1. Identify the exact accepted merge, lock and canonical baseline digest. Require
   both schema guards, strict schema inventory, final cutover audit, strict
   website/MCP parity, and all five hosted checks. Keep the same post-merge
   source tree exactly as tested. Verify the focused signed browser cases on
   a disposable stack and check full Storage before/after in that same stack.
2. Run representative synthetic workflows: teacher/recipient denial, one
   group completion and replay, unchanged closed history when an alias is
   ambiguous, month close with pending versus posted values, report sharing
   revocation, and valid/invalid invite gating. Record actual coverage and any
   not-run browser/native-client checks; synthetic MCP is not ChatGPT/Claude
   client sign-off.
3. Verify the package release instructions and version metadata without
   bumping a version, making a tag, switching traffic or running the release
   workflow as part of source verification.

## Separate gate before upgrading the existing beta

Use [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md) and the
[operator runbook](SCHEMA_TRANSITION_RUNBOOK.md). Inventory retained data
privately, verify an encrypted off-host DB/Auth/Storage backup restores to an
isolated target, then choose and approve exactly one target and mapping
(direct transition or verified fresh import). Reconcile present and archived
learners, sessions and attendance, files, financial totals and scoped portal
rights. Verify an explicit rollback and stop condition before write access or
traffic can move. Never reset the live database from CI. The candidate's
invite-only boundary and pending live/client checks must remain visible in
the release disposition. No candidate evidence authorizes public launch.
