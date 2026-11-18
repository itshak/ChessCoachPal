# Design: canonical baseline and operational schema convergence

## Inventory and policy
Current installation snapshot: supabase/migrations/20261107000000_chesscoachpal_baseline.sql. Existing authorized operational transitions: 20261117000000_live_historical_lifecycle_extension.sql, 20261117190000_mcp_workflow_composition.sql, 20261117231554_family_communication_locale.sql and 20261118000000_multilingual_teacher_and_family_locale.sql. Do not mistake these for a supported upgrade history for fresh installs.

Introduce a declarative ordered manifest containing each transition name, applicable prior revision, intended target objects, required backup/safety classification, and baseline objects expected to match. The schema guard SHALL continue refusing unexpected migration files, but its approved list is updated in the same change as any new deployment transition. Include a test that changing the baseline without approving the live strategy fails review, not necessarily every code-only edit.

## Structural acceptance
In ephemeral Compose/Supabase, bootstrap A from the latest baseline. Bootstrap B from a frozen representative previous revision and apply the approved ordered transitions exactly once. Compare normalized app-owned definitions, privileges/RLS and data contract read/write behavior. Account for Supabase-managed storage/auth objects separately. Do not demand equal internal migration history rows.

For data-changing cutovers, test with synthetic students having multiple workplaces, archived history, group attendance, old guardians, invoices, credits, events, consent and portal tokens. Assert counts and referential integrity at each boundary. In-place renames and drops require explicit mapping and recovery evidence.

## Release sequencing
Baseline → test on clean instance → transition on isolated restored snapshot → security/parity/replay checks → production backup with verified restoration → approved one-time live transition → deploy dependent code → post-deployment reconciliation. Do not run the fresh-install baseline against a populated instance.

## Risk register
Existing migration versions are already recorded and will not replay simply because SQL changed. CI may reveal baseline-only or transition-only objects; resolve these discrepancies without destructive changes to real data. A rollback is primarily an isolated database restore and controlled app rollback, not a guessed inverse migration. Never store real child data, credentials or restored production dumps in GitHub artifacts.
