# Final local ChatGPT + Claude acceptance — v0.1.0 release-only procedure

**Status:** NOT EXECUTED. This is a procedure/template, **not** evidence that the providers work. It is the only required manual live-provider test in the v0.1.0 roadmap, and must be carried out **on the maintainer's machine immediately before actually publishing `v0.1.0`**. Do not run it just to archive an OpenSpec development change. Development CI, OAuth/MCP integration, RLS, privacy, backup and contract checks run automatically on GitHub with **synthetic** students and teachers.

## Preconditions

1. Milestones 1, 2 foundation, 2b, 3 and 4 are archived based on *merged* GitHub Actions evidence in docs/STATUS.md, and remaining non-provider release-readiness checks must be completed before this manual test. Keep package version **0.0.0** until this local test passes.
2. From the maintainer's own computer, test against a fresh, disposable ChessCoachPal self-hosted or dedicated Vercel + Supabase staging instance and **synthetic students, sessions and teachers only**. Do not reset an existing database with real students. For hosted staging use [the detailed staging MCP runbook](STAGING_MCP_ACCEPTANCE.md); do not confuse it with a public GitHub Release. Enable MCP credentials only for this test; use a dedicated random `MCP_SESSION_ENCRYPTION_KEY` and nonproduction Supabase keys. Never commit credentials.
3. Real remote ChatGPT/Claude clients cannot directly reach an arbitrary `localhost` server. Expose **only the temporary test instance** via a secure HTTPS domain (including a disposable hosted staging deployment) or vetted HTTPS tunnel from the local machine; set `MCP_PUBLIC_ORIGIN` to its exact reachable HTTPS origin. Disable the exposure and revoke test grants afterward. Protect the public registration endpoint with rate limits and avoid logging tokens/prompts/student details.
4. Use supported account/plan options with custom **write-capable** MCP connectors for both vendors, if available. Current provider UI/access may change; verify the actual supported client and version rather than assuming an account is eligible. Follow [AI_CONNECTORS.md](AI_CONNECTORS.md).

## Test matrix — manually complete each row directly before the release PR

| Check | ChatGPT | Claude |
| --- | --- | --- |
| Record client product/plan and version, date, and temporary endpoint hostname (no tokens) | Not tested | Not tested |
| Register/connect MCP endpoint; authorize synthetic teacher through OAuth PKCE with expected scopes | Not tested | Not tested |
| Discover a known session and student by stable IDs; verify no foreign teacher data appears | Not tested | Not tested |
| Write a **single student's** confirmed attendance and/or lesson topic using the supported tool; capture a privacy-safe receipt | Not tested | Not tested |
| Open ChessCoachPal website on the same data and correct the record; check tool read-back reflects correction | Not tested | Not tested |
| Revoke client authorization in website; verify subsequent tool calls are denied | Not tested | Not tested |
| Confirm no secrets, real student names, private prompts or unsafe URL appear in saved evidence | Not tested | Not tested |

The expanded tools are implemented: **both** live clients must exercise at least one authorized create and one revision-checked edit (using a fresh UUID idempotency key for each intentional mutation), then demonstrate website readback/correction and revocation. Do not substitute synthetic MCP calls for either provider. **Do not accept a simulated HTTP client as a substitute** for both real platforms.

## Pass/fail and release sign-off

- **Fail or plan restriction:** Do not publish. Leave docs/RELEASING.md's manual third checkbox unchecked and package at 0.0.0. Fix server/client constraints via PR and GitHub Actions, and repeat this final local check when a releasable candidate exists.
- **Pass:** Record the tested main SHA, date, hostname (safe), both vendor product/client versions, approved scopes, basic call outcome/receipt IDs (redact private contents), website correction, revocation and relevant screenshots/transcript excerpts **without** access tokens, codes, refresh credentials, secrets, student data or full model prompts. Link this sign-off in docs/STATUS.md.
- Only the maintainer who actually performed the local test may mark the third readiness checkbox in [RELEASING.md](RELEASING.md). Fill all other readiness checkboxes from GitHub automated evidence first. Then open/merge the reviewed `0.1.0` package/lock/changelog PR. GitHub Actions **automatically** runs release checks and publishes the tag and source archives if all gates pass. No manual upload/tag action is required.
- Revoke test grants, stop the HTTPS tunnel/temporary exposure, dispose of the synthetic test data safely, and retain only sanitized evidence.

**No real-client validation is claimed yet.** This document assigns the gate to actual v0.1.0 publication, not to pre-release development.
