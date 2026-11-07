# Design — self-hosting, restore and first release

## Fresh deployment

Reuse Next.js, Docker and Supabase/Postgres only where current chess-only functionality is needed. Installation begins from an **empty volume** and current baseline, with environment templates using placeholders (never student data or real secrets), documented ports and auth settings. Teachers can manage lessons via website with no OpenAI/Anthropic/Notion/Google subscription; AI accounts are needed only to access their optional external AI clients.

## Recovery boundary

Provide an explicitly invoked operator backup and restore workflow that covers Postgres data (including required auth-related state) and all uploaded files. Restore into a second clean environment using the **same current schema**, verify student/group/session/attendance links, data counts, object references and uploaded file bytes. This is current-version recovery, not pre-1.0 migration or backward compatibility.

## Minimal deterministic reporting

Produce teacher-owned workplace/date-range teaching and attendance summary using stored records. Teaching duration is summed **once per session**, while attendance counts stay per participant. Support safe CSV/text export and verify locale/Hebrew RTL presentation for supported views. Do not let a model guess totals or silently share private notes across workplaces.

## Test gates and documented evidence

- Fresh setup, safe first-run account creation, seeded synthetic workflow and production Next build.
- Main CI: dependency install, typecheck, unit tests, release-helper tests, Docker image and Compose checks.
- Browser E2E for create/edit/reload, group/private lesson and attendance, notes, PWA and core accessibility.
- Real ChatGPT and Claude client tests with delegated teacher authorization, provider outage fallback and website correction.
- Two-teacher authorization/RLS checks, privacy/history audit and third-party license approval.
- Restore backup into second disposable instance with uploaded objects and verify equivalence.

Document exact commit SHAs, test run URLs and approvals in docs/STATUS.md. Skipping a release-critical test is not a pass.

## GitHub release operation

All six first-release checkboxes in docs/RELEASING.md require verified evidence before marking complete. The release-script validator refuses v0.1.0 while any are unchecked. When milestones 1–4 have passed, prepare v0.1.0 in package.json, package-lock.json and CHANGELOG.md through the scripted release preparation and review in a PR.

Merging the reviewed version bump into main triggers the automatic GitHub Release workflow. It verifies fresh installation and tests, then creates an annotated tag for the exact commit, release notes from the changelog, and source-code ZIP and tar.gz. Do not manually tag an unverified release; a failed gate blocks publication.

ADR-0001 remains binding, and no installation may silently destroy real student data.

