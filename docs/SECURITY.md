# Privacy, secrets and publication safety

**Status: repository already PUBLIC; historical privacy and license audit NOT completed; v0.1.0 release approval NOT granted.**

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

Active security and old-source clean-up is tracked under [remove-cognote-legacy-and-secure-data](../openspec/changes/remove-cognote-legacy-and-secure-data/proposal.md), with the final release gate under [verify-self-hosting-and-release-v0-1-0](../openspec/changes/verify-self-hosting-and-release-v0-1-0/proposal.md). Record inspected GitHub refs, affected file ranges, CI logs/artifacts, findings, remediation, rotation and approval evidence in [STATUS.md](STATUS.md). GitHub visibility cannot be undone by merely editing these docs.
