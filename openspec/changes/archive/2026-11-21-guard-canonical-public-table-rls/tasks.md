# Tasks — canonical public-table RLS coverage

- [x] Confirm the merged baseline declares 87 public tables and 87 explicit RLS enables in the 2026-11-20 snapshot.
- [x] Add a canonical public-table RLS coverage checker with fail-closed negative cases.
- [x] Wire the checker into the existing default/strict schema guard and guard-test entry point.
- [x] Verify exact PR-head GitHub CI, E2E, security, Compose and backup/restore.
- [x] Merge verified source, check merged-main CI, mark source accepted and move this directory into OpenSpec archive.
- [x] Record that this source guard does not authorize real database change or close the P0 schema freeze.

**Source acceptance:** PR [#110](https://github.com/itshak/ChessCoachPal/pull/110) head `986fa3671451f874a3e1e461b8d814cf526f7a1f` passed CI, E2E, security, Compose and restore; merge `35a8526e6b0fa18b64f71ad979c03f36e5aee2c5`. Archive acceptance additionally requires those same GitHub workflow families green on merged-main and this archive PR head before merge. The parent P0 freeze remains open. No production access/cutover.
