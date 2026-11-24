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

## Still open

- Actionable missing-attendance, due-homework and stale-rating evidence;
  actionable lesson links and deterministic preparation.
- Reviewed atomic lesson close, learner/import review and full coverage
  of archived-learner recovery through the daily workflow.
- Complete website/MCP acceptance and evidence before archival. This
  schedule slice alone does not complete the Daily Coaching proposal.
