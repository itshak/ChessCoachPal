# Tasks — verify-self-hosting-and-release-v0-1-0

Development tasks 5.1–5.7 and automated parts of 5.9–5.12 must be verified on merged main via **GitHub Actions with synthetic data**, independent of real ChatGPT/Claude availability. **Task 5.8 is the sole manual local test**, performed on the maintainer's machine **immediately before actual v0.1.0 publication**, not during development or other OpenSpec archives. Release task 5.11 requires an actual published GitHub Release. See docs/LOCAL_CLIENT_ACCEPTANCE.md.

- [ ] 5.1 Verify clean Docker/Supabase + app setup from a new clone and empty database with no mandatory AI/cloud account.
- [ ] 5.2 Document safe environment configuration, account onboarding, first-run use, troubleshooting and explicitly chosen local resets.
- [ ] 5.3 Implement and test complete database and uploaded-file backup/restore into a second clean installation; compare synthetic rows and file contents.
- [ ] 5.4 Implement and verify deterministic workplace/date-range teaching-time and attendance summary, basic CSV/text export and supported Hebrew RTL formatting.
- [ ] 5.5 Document an end-to-end chess coach tutorial: two workplaces, student, group/private session, attendance, note, curated study link and correction.
- [ ] 5.6 Record passing candidate-commit npm ci, typecheck, unit tests, release-tool tests, Docker image and Compose validation.
- [ ] 5.7 Record production build and seeded Playwright pass, including the core coaching workflow, reload persistence, PWA and accessibility smoke.
- [ ] 5.8 **Final prepublication manual test ONLY:** after all other automatic development gates pass and immediately before v0.1.0 version-bump merge, the maintainer uses real ChatGPT and Claude clients on their machine against a locally controlled, securely HTTPS-exposed synthetic ChessCoachPal install, proves delegated authorization, tool write, immediate website correction and revocation, records sanitized client versions/outcomes in docs/STATUS.md and signs off. Tenant isolation, OAuth security, error scenarios and provider-unavailable website fallback remain **automated GitHub tests** (not manual checks).
- [ ] 5.9 Complete the outstanding Milestone 4 historical Actions logs/artifacts, personal-data/private-URL and older recoverable-SHA review; document scan scope and every candidate finding, rotate any real compromised key and use supported GitHub-side remediation if needed (never infer purging). Obtain acceptance of prior changes (archived 1 and 2 foundation, automatically verified 2b, 3 and 4), privacy/history/license review and all other GitHub-based checks; then, **only after 5.8**, check the manual provider line and the six docs/RELEASING.md boxes with recorded evidence.
- [ ] 5.10 **After final local manual sign-off (5.8) and every release checklist box**, prepare/merge reviewed package/lock version 0.1.0 and dated honest CHANGELOG.md with breaking-change warning, triggering the GitHub release workflow. No earlier bump/publication.
- [ ] 5.11 Observe passing release workflow and actual annotated v0.1.0 Git tag + GitHub Release containing changelog and ZIP/tar.gz source archives.
- [ ] 5.12 Record final release URLs, tested commit, backup/restore evidence and status; archive completed changes after accepted implementation.

