# Daily coaching implementation progress

## Verified source: upcoming canonical lessons by date and workplace

[PR #174](https://github.com/itshak/ChessCoachPal/pull/174) merged at
`ab3bd86b71e90895da413da53aab632cdfc152ad`. An optional ISO civil date on
the existing dashboard summary HTTP route and `ccp_dashboard_summary`
returns the same future scheduled occurrences as the dashboard. No date
leaves the prior HTTP/MCP response unchanged. The dashboard defaults to
today in the selected workplace zone, or the teacher's zone for All
workplaces. It distinguishes unavailable data from an empty list and
shows when more than 24 lessons are scheduled, with English, Hebrew and
Russian labels.

The query emits one row per persisted scheduled session, sorted by
actual start then ID. It does not resolve a student roster, create a
recurrence occurrence, derive attendance from the schedule, or expose
private participant records. No schema, release, or deployment change.

Exact candidate `9f388451a00e5beeb3d76f7bca6ded9a920b7e8c` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45451913347),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45451911014),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45451911840),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45451910668)
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45451910688)
(442 browser cases and three additional scheduling repetitions; fresh
synthetic local Supabase). The [growable parity matrix](../../../docs/MCP_NEW_PARITY_SCENARIOS.md)
records the new signed scenario. Neither this proof nor a green
repository check is certification in actual ChatGPT or Claude clients.

## Verified source: missing attendance after ended lessons

[PR #176](https://github.com/itshak/ChessCoachPal/pull/176) merged at
`5df561935d53bde4daf68c4933fe51d235fa7b5f`. The same dated dashboard and MCP summary
compare each ended lesson's frozen roster with persisted attendance decisions.
One task represents one canonical session. Unrecorded or oversized rosters,
truncation and unavailable service are distinguished from fully marked lessons.
No participant identity or note is included in the review response. When the
current schedule can resolve it, a link reaches the exact lesson's attendance
control without generating recurrence or changing records.

Exact candidate `51f614a63c505928f7dc3424d30d828cc7f0e901` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45466325976),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45466325773),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45466325886),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45466325813)
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45466325793)
(443 browser cases and three scheduling repetitions). The authenticated fixture
exercised a partial frozen group including an archived learner, complete and
unknown rosters, tenant and workplace filtering, and persisted no-write evidence.
No schema, release, or deployment change.

## Verified source: due-through homework review

[PR #178](https://github.com/itshak/ChessCoachPal/pull/178) merged at
`d41f793b8af4b9ba738156ccab3012c320f1a3ac`. The dated dashboard and MCP summary
read current submission and review evidence for active learners through the chosen
due date. The display distinguishes due without a submission, submitted awaiting
review, and needs-work. A review of an older attempt does not resolve a later
submission, and no status asserts mastery. Pagination uses a bounded due-date and
assignment-ID cursor, including a continuation when an entire window is reviewed.
Assignments do not record venue, so the feature is explicitly available in All
workplaces only; selected workplace membership is not provenance. The response
omits learner identities, private instructions, notes and feedback. No-date
summary callers are unchanged.

Exact candidate `7735a3b9644ab61d144db26c1f9fe722e369fa3b` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45475517916),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45475518128),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45475517527),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45475517246)
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45475517494)
(444 browser cases and three supplemental repeats). No new homework write or
exact browser action link was added. No schema, release, or deployment change.

## Verified source: prepare an exact upcoming lesson

[PR #180](https://github.com/itshak/ChessCoachPal/pull/180) merged at `4397f23b4c94a020da718fdbccec1dff6380c5d2`.
The dashboard action, authenticated GET and delegated MCP
`ccp_lesson_preparation_get` share the exact scheduled-session read. It is
restricted to the owner and current workplace context or All, with a
bounded frozen roster and prior recorded evidence. Shared materials
are shown once per material/stage, with explicit coverage and unknown
states. Counts are limited to verified observations at the lesson's
workplace and teacher-wide homework evidence for its frozen learners.
The preparation result does not include learner identities or private
notes or claim mastery. No write, recurrence generation or external
provider is involved.

Exact candidate `df3260a259aac61a2ef68b3017549ca17f160fec` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45489172405), [Security](https://github.com/itshak/ChessCoachPal/actions/runs/45489172402),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45489172413), [backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45489172438),
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45489172401) (445 browser cases
plus three scheduled repeats). The original E2E setup refused an
unenrolled foreign fixture; its dated synthetic enrollment was the
only test correction. Cross-tenant denial and no-write assertions
passed on the corrected head. No schema, release or deployment change.

## Verified source: complete the exact ended lesson

[PR #182](https://github.com/itshak/ChessCoachPal/pull/182) merged at
`5d9036744e31c37525ec27a847a91a025aae3a2c`. An actionable missing-attendance
card opens the exact ended scheduled occurrence in the existing completion
panel, not a fallback list item. The signed GET and delegated MCP roster
preview check the current workplace context and the frozen roster. Changed
context requires reload. Persisted cancellation decisions instead use
schedule attendance review and are not overwritten. Explicit approved
completion uses the existing atomic attendance and optional shared-note
operation. No material evidence is part of that transaction.

Exact candidate `0ca0b0001bb0c0826cb487f57f7b5b7c148d2ce7` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45499371843),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45499372082),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45499371845),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45499371759),
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45499371778)
(446 browser cases plus three scheduling repeats). No schema, release or
deployment change. Real client acceptance remains separate.

## Verified source: focus one exact homework assignment

[PR #184](https://github.com/itshak/ChessCoachPal/pull/184) merged at
`26b3b8d49bd26cc43d4f2475a6ac8b7ae6e84f0c`. The Daily queue links to the
exact assignment in Learning, independently of paging. Learning, signed
GET and delegated MCP `ccp_daily_homework_focus_get` share a bounded
teacher-owned current read. The active context must be All workplaces.
An already-reviewed, archived, foreign or not-yet-due item cannot fall
back to another assignment. Only the allowed exact focus shows its learner
display name; neither the queue nor the detail exposes private notes or
feedback. This is a read-only view, not a new review write.

Exact candidate `24ffcb47470ba91ac2344fd45b03bd78f46b1ce6` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45507936600),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45507936465),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45507936461),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45507936557),
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45507936665)
(446 browser cases and three scheduling repeats). The initial draft needed a
real signed focus tool and registry entry; its browser run also hit a local
test mail port collision before running tests. The corrected exact head
passed both. No schema, release or deployment change.

## Verified source: recorded online rating lookup outcomes

[PR #186](https://github.com/itshak/ChessCoachPal/pull/186) merged at
`0982b7e06b1bb435c0e195eaa9aaa3a69dd6890e`. The dashboard, signed summary and
delegated MCP agree on bounded counts of recorded failures, retry responses and
discarded results on the selected civil day. Only the most recent matching
receipt that day contributes per active owned consent; a subsequent success
suppresses earlier errors. All workplaces is required because provider lookups
have no workplace provenance. This is stored attempt evidence, not a live
health check, elapsed-age freshness or proof that missing evidence means
failure. No provider calls, automatic worker activation or data changes.

Exact candidate `9c1ade4f90e4b4a0c8b9e2d14e383f7eed1b93e6` passed
[CI](https://github.com/itshak/ChessCoachPal/actions/runs/45514321151),
[Security](https://github.com/itshak/ChessCoachPal/actions/runs/45514321276),
[Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45514321295),
[backup/restore](https://github.com/itshak/ChessCoachPal/actions/runs/45514321249),
and [signed browser/MCP E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45514321310)
(447 browser cases plus three scheduling repeats). No schema, release or
deployment change.

## Still open

- Age-based freshness requires a separately justified policy; neither old
  snapshots nor missing provider receipts imply lookup failure.
- A reviewed atomic completion with taught material evidence, learner/import
  review and full coverage of archived-learner recovery in the daily workflow.
- Complete website/MCP acceptance and evidence before archival.
