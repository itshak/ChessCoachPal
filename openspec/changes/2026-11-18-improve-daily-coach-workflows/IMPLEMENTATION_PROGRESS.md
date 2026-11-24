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

## Still open

- Stale-rating evidence and preparation/recording from upcoming lessons; exact
  homework resolution navigation remains separate.
- Reviewed atomic lesson close, learner/import review and full coverage
  of archived-learner recovery through the daily workflow.
- Complete website/MCP acceptance and evidence before archival. This
  schedule slice alone does not complete the Daily Coaching proposal.
