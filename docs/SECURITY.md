# Privacy, secrets and publication safety

**Status: repository already PUBLIC. Milestone 4 implementation and reachable-ref secret scan are CI-verified; broader historical privacy/asset review and v0.1.0 publication approval remain OPEN.**

ChessCoachPal serves chess coaches and may eventually hold minors' records. The repository SHALL contain only public source, safe defaults and synthetic examples. Real names, workplace identities, report URLs, cloud service IDs, secrets and personal records belong outside Git.

## Urgent audit of already-public repository and prerequisites for v0.1.0

1. Audit all files in the replacement root for secrets, real personal data, private asset URLs and unnecessary third-party datasets.
2. Audit the ORIGINAL repository history, branches, tags, GitHub Actions logs/artifacts, cached commit URLs and any pull-request refs.
3. Rotate any tokens that may ever have been committed; deleting source does not invalidate credentials.
4. Verify MIT provenance and rights to all redistributed music indexes, graphics, glyphs and dependencies; remove assets of uncertain provenance.
5. Run dependency/secret scanning and review default development settings, family access tokens, Supabase service-role routes and RLS.
6. Test an unrelated teacher cannot retrieve another teacher's student or workplace data, including through AI tools.
7. Confirm backups include uploaded objects as well as database rows.
8. Record completion evidence and approvals in docs/STATUS.md.

**History rewrite is not total erasure.** Creating an orphan root and force-updating main removes the earlier commits from normal branch ancestry, but GitHub can still retain and serve old objects by commit SHA or cached views. See [GitHub's removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository). An appropriate GitHub Support purge or an independently verified newly created repository may be needed before public visibility.

Never advertise the repository as safe to publish solely because a source scan of the new HEAD passes.

Active security and old-source clean-up is tracked under [archived remove-cognote-legacy-and-secure-data implementation](../openspec/changes/archive/2026-11-08-remove-cognote-legacy-and-secure-data/proposal.md), with the final release gate under [verify-self-hosting-and-release-v0-1-0](../openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md). Record inspected GitHub refs, affected file ranges, CI logs/artifacts, findings, remediation, rotation and approval evidence in [STATUS.md](STATUS.md). GitHub visibility cannot be undone by merely editing these docs.

## Milestone 3 scoped learning-record security evidence (not a full repository audit)

Merged [PR #7](https://github.com/itshak/ChessCoachPal/pull/7), main commit [822a33f](https://github.com/itshak/ChessCoachPal/commit/822a33f0881821c1de479629bf15d39264d2dcc1), adds RLS for private chess categories/observations/resource links and composite teacher ownership plus frozen-session roster constraints. [CI 42415536708](https://github.com/itshak/ChessCoachPal/actions/runs/42415536708) and [synthetic fresh-Supabase E2E 42415536816](https://github.com/itshak/ChessCoachPal/actions/runs/42415536816) pass; two-teacher tests deny foreign reads and writes. HTTPS/Lichess URLs are validated and never server-fetched. The agent has no suggestion-approval tool. These narrowly scoped checks do **not** complete the original-history/secret/licensing audit in Milestone 4; that release gate is still active.

## Milestone 4 documented audit boundary — 2026-11-08

[PR #9](https://github.com/itshak/ChessCoachPal/pull/9) was squash-merged as [af9f4c6](https://github.com/itshak/ChessCoachPal/commit/af9f4c64de70e6b96674c5eb46fcaad35381548a). [Feature CI 42421265827](https://github.com/itshak/ChessCoachPal/actions/runs/42421265827), [E2E 42421265817](https://github.com/itshak/ChessCoachPal/actions/runs/42421265817) (25 passed, 5 skipped), and [reachable-history audit 42421265798](https://github.com/itshak/ChessCoachPal/actions/runs/42421265798) passed. On merged main, [CI 42421647203](https://github.com/itshak/ChessCoachPal/actions/runs/42421647203), [E2E 42421647198](https://github.com/itshak/ChessCoachPal/actions/runs/42421647198) (25 passed, 5 skipped) and [history audit 42421647204](https://github.com/itshak/ChessCoachPal/actions/runs/42421647204) also passed.

- **Automated reachable source/history:** the GitHub-only [main history scan 42421647204](https://github.com/itshak/ChessCoachPal/actions/runs/42421647204) inspected 20 accessible branch/PR refs, 787 readable text Git blobs; no high-confidence hard-coded secret remains after a confirmed false positive in `docker-compose.example.yml` (`${POSTGRES_PASSWORD}` reference, not an embedded value). The scanner intentionally does not emit matched values. Deleted/unreferenced cached SHAs and external copies are **not established to be purged**.
- **Application boundaries:** two-teacher real-Supabase test on [main E2E 42421647198](https://github.com/itshak/ChessCoachPal/actions/runs/42421647198) checked RLS, cross-tenant IDs and unauthorized writes. Services use scoped teacher identity; unknown family links render not-found content even where Next.js streaming uses HTTP 200.
- **CI logs:** spot review revealed an ephemeral synthetic `TOKEN_ENCRYPTION_KEY` visible in older test logs. This was not a live service secret, and fresh CI runs generate new keys. Both E2E and release workflows now explicitly mask generated values and service-role keys before export. Archived old logs may still exist until retention, so never claim they were purged.
- **License/material audit:** the current lockfile lists 634 packages with declared license metadata, including MIT/Apache-2.0/ISC/MPL-2.0/LGPL terms. Old CogNote music assets and music-specific sample records were removed. Upstream MIT author/provenance remains in LICENSE and docs/UPSTREAM.md. Maintain license notices and separately review redistributed binary/native and historic assets before release.
- **Remaining acceptance:** the Actions log/artifact scanner must run and any manual candidate PII/private URLs or older recoverable GitHub objects need review and remediation. A clean automated regex scan is not proof that all personal data is absent. No broad real-student data or production secret exposure is asserted to be remediated without evidence. Release remains **BLOCKED** in Milestone 5 task 5.9.
