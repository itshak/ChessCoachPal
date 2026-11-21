# Tasks — canonical public-table RLS coverage

- [x] Confirm the merged baseline declares 87 public tables and 87 explicit RLS enables in the 2026-11-20 snapshot.
- [x] Add a canonical public-table RLS coverage checker with fail-closed negative cases.
- [x] Wire the checker into the existing default/strict schema guard and guard-test entry point.
- [ ] Verify exact PR-head GitHub CI, E2E, security, Compose and backup/restore.
- [ ] Merge verified source, check merged-main CI, mark source accepted and move this directory into OpenSpec archive.
- [ ] Record that this source guard does not authorize real database change or close the P0 schema freeze.
