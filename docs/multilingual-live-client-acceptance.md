# Multilingual release acceptance — real ChatGPT, Claude and assistive technology

**Status: pending. This checklist is a manual, owner-authorized prepublication gate; no live client results are implied.** It complements automated delegated OAuth MCP tests, not a substitute for them. Do not mark OpenSpec E5/F2/F3/F4 complete based only on a model's plausible answer.

## Environment and privacy prerequisites

- Use an authorized, isolated staging/self-host instance at a known exact commit and **synthetic** teachers, families and students. Never upload a real pupil's private notes, identity documents, invoice, email address or chess lesson evidence to a third-party AI without the teacher's informed approval.
- Ensure owner-scoped Supabase schema and consented OAuth are deployed from a reviewed **non-destructive migration** on a backed-up test-data clone; record the database revision. Confirm the old database is restorable before migration testing.
- Verify the actual approved MCP origin `/mcp`, OAuth redirect/client registration, scopes, and tool allowlists. Credentials, bearer portal links, signed callbacks and provider tokens must not appear in test reports, screenshots or logs.
- Record **date, exact Git SHA, app deployment, browser/device, ChatGPT and Claude versions/connections, test data IDs, and reviewer**. Test only capabilities that the two live clients actually expose; explicitly record any unsupported client behavior.

## Live assistant matrix — run separately in ChatGPT and Claude

| Action | Explicit Hebrew message | Explicit Russian message | Evidence required |
| --- | --- | --- | --- |
| Connect and read trusted teacher context | Ask for your current coaching context in Hebrew even while teacher UI is Russian | Repeat in Russian while UI is Hebrew | Real `ccp_teacher_context_get`, expected locale/timezone and no leaked contacts or credentials; reply follows explicit message language |
| Name and alias safety | Find a synthetic Hebrew pupil using an **exact registered Russian alias** | Reverse the two scripts | Actual teacher-owned student ID and correct original Unicode spelling; duplicate aliases must return `NEEDS_RESOLUTION`, never silently choose |
| Session preview | Preview one scheduled group lesson in Hebrew with a human-written note | Preview it in Russian | Same students, time, timezone and one teacher lesson duration; nothing saved before confirmation |
| Session commit and readback | Explicitly approve the exact pending session | Explicitly approve the next distinct session | Stable session/participants in website **and** real MCP readback; original notes unchanged and no inferred attendance/mastery/rating |
| Website/MCP settings parity | Change teacher interface preference, then a family communication preference | Restore preferences via MCP | Account language changes only UI; family preference controls recipient email/PDF; workplace locale/currency/timezone unchanged |
| Output language | Request an existing workplace report in Russian from a Hebrew prompt | Request Hebrew report from a Russian prompt | Identical canonical report numbers and safe UTF-8 BOM CSV/TXT by website and MCP for same explicit `outputLocale` |
| Negative authorization | Attempt invalid locale, foreign teacher record, unapproved sensitive write | Repeat with different script | Stable machine error codes/permission boundaries and no side effects; human prose may be localized |

Record the **real tool execution receipt and persisted readback**, not merely the assistant's narrative response. A language preference must never imply permission to send an invoice, publish PGN, alter a lesson or disclose pupil information.

## Recipient output acceptance

- Use three synthetic families (explicit `en`, `he`, `ru`), each with approved test email recipients. Confirm event invitations, reminders, approved notes and cancellations in plain text and HTML `lang`/`dir`, with intact original names and notes. Switching teacher UI language must send nothing and must not change those recipient languages.
- Preview the same invoice for every family: exact original billable line items and ILS/USD financial totals, correct Unicode Hebrew/Cyrillic names, RTL alignment, legible instruction wrapping, embedded licensed fonts and intact QR. Confirm sent-email PDF matches the authorized downloadable invoice content. Confirm unsubscribed/unaddressed recipients cannot receive email.
- Verify guest family portal language independently from teacher/family mail preference, inaccessible unowned records, and no portal bearer token leaked into public metadata or error reports.

## Accessibility and RTL visual acceptance

- On a real phone/narrow viewport, 640px effective CSS layout, 200% browser zoom on desktop, and a wide desktop, navigate every teacher entrypoint in all three languages; check no horizontal document overflow, clipped controls, stuck dropdowns or truncated original names.
- Navigate by **keyboard only**, including language switcher, navigation drawer, dialogs, date editors, calendar, report download and payment screens. Check logical focus order and visible focus, including escape/return behavior.
- Use a **real screen reader** (VoiceOver, NVDA or equivalent) in Hebrew RTL and Russian. Confirm semantic headings, localized button/field/error announcements, correct `lang`/`dir`, sensible mixed-direction reading for emails, chess notation and numbers. Automated DOM/Playwright checks do not certify this.
- Confirm public marketing, sign-in/up/reset, OAuth consent, guest portal, legal pages, PWA/offline/error states, teacher/help screens, notifications, chess capture and history. A qualified owner must review translated legal/tax/marketing claims and font redistribution rights.

## Sign-off

Do not publish a multilingual release or archive `openspec/changes/2026-11-17-introduce-multilingual-support` until full automated CI/E2E/security/Compose/restore gates pass on the **exact integrated head** and the above manually verifiable checks have documented owner acceptance. The current user directive is **DO NOT MERGE PR #86**; leave F3/F4 pending until explicitly authorized.
