# ChessCoachPal current engineering and release status

**Updated 2026-11-22.** The preproduction source schema is frozen in [merged PR #115](https://github.com/itshak/ChessCoachPal/commit/0147c7aa34f680b6defa9f202f28c64e9fc6b5ba); the lock pins the canonical baseline, transition manifest, and its accepted source parent. The verified lock revision passed [CI](https://github.com/itshak/ChessCoachPal/actions/runs/45050825741), [authenticated E2E](https://github.com/itshak/ChessCoachPal/actions/runs/45050825687), [security](https://github.com/itshak/ChessCoachPal/actions/runs/45050825737), [fresh Compose](https://github.com/itshak/ChessCoachPal/actions/runs/45050825717), and [synthetic restore](https://github.com/itshak/ChessCoachPal/actions/runs/45050825693). Two independent PostgreSQL 17.12 bootstraps produced matching complete Format 3 snapshots, with no row-contract differences across 60 declared tables/730 fields. See [source acceptance](../openspec/changes/archive/2026-11-21-consolidate-final-preproduction-saas-schema/SOURCE_ACCEPTANCE.md) for exact source and limits.

## Active work

Twelve functional OpenSpecs remain. Workplace Context is first, followed by [the dependency tracker](../openspec/changes/README.md). Preserve shared authenticated website/MCP behavior and the frozen schema. Use ADR-0019 for genuinely unforeseen persistence requirements rather than editing the locked baseline.

## Release and data safety

The last published release is **v0.1.9**. This source freeze did not publish a version, migrate a live database or enable billing. One real database transition (or an independently verified clean import) remains separately gated by [ADR-0017](adr/0017-pre-v1-single-final-cutover-no-compatibility.md) and [the operator runbook](SCHEMA_TRANSITION_RUNBOOK.md), which require specific authorization and private Auth/Storage/finance/portal and historical reconciliation. Do not infer real-data or live-client acceptance from synthetic tests.

[Dated development records](history/STATUS_THROUGH_2026-11-19.md) remain available for past decisions.
