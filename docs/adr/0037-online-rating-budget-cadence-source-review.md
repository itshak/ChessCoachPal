# ADR-0037: Review exact online rating budget and cadence source

**Scope:** Exact successor permit only, under
[ADR-0020](0020-review-exact-preproduction-schema-successors.md). This
decision does not install the candidate, start a worker, call providers,
supply a live quota, or authorize deployment.

## Decision

Persist a shared request reservation, daily and monthly UTC spend, and
cooldown for each existing online ratings provider. Both providers are
disabled with zero quota on a fresh install. Only administrative database
access can enable a provider or set either quota; the trusted service can
record usage and operational state. The reservation is committed before
any future egress. An exact token can settle it once, and an abandoned
token or unusable cooldown fails closed to an operator hold. The table
uses RLS and is excluded from the browser row contract; the three
invoker routines are executable only by the owner and service role.

Add explicit bounded recurring enqueue for supported active learners with
current provider consent and unchanged handles. Enqueue no historical
catch-up, and never write more than eight jobs per call. Deterministic
oldest-due selection, exact generation and date deduplication, and
rechecking the learner and consent under row locks avoid stale and
duplicate scheduling. The worker still has to independently obtain a
provider reservation, claim eligible work, verify fresh consent, call the
approved transport once and finalize. No timer, routing, activation or
new provider traffic ships with these schema bytes.

## Exact evidence

- [Preserved candidate](https://github.com/itshak/ChessCoachPal/commit/7230fb806e44a5a4e866557fc9355ed108645ea1):
  sole predecessor `55d593e11c41956e7cdb13cc2c2f27e57e870e06`,
  exact tree `e23b6128d7c8e526be57ab2bbbd7defc63ba3eb2`. A separate Git
  fetch verified the same parent, tree, and unchanged lock. Baseline
  SHA-256 `cd80acc4b18b9f21cbad2c6c419128cd45fa6a094390271f278db5407e4b3a9f`;
  manifest SHA-256
  `295d9ad97a1ec6401e85f55b0a2c67efeb74e3c558c508876475ef4a75df9ae6`.
- Two fresh disposable PostgreSQL 17.12 installs matched each other,
  with Format 3 digest
  `5b79a5af8811d6276854b2569218c41f3173258e819f5599bdb99822f7e0c312`,
  versus predecessor
  `505de99cf86b73c279e10b5ce89217fd3aaeece2f817da5d4b6f2d3df08cb2a7`.
  The structural delta consists only of the new table with its grants,
  constraints and indexes, and three new routines and their grants.
  All 61 typed row contracts and 748 columns passed without changes.
- Separate PostgreSQL sessions verified one reservation at a time,
  independent progress for the other provider, and concurrent scheduling
  of two different due learners without duplicates. Synthetic checks
  covered default pause, restricted settings, quota rollover, durable
  cooldown, hold, stale tokens, queue bounds, current consent, claim,
  replay and skipping recent, busy and revoked learners. The representative
  plan with 2,500 learners, 5,000 consents and 30,000 jobs selected 32
  candidates in 36 ms on the test server with warm buffers, using the
  existing job owner index. This is one synthetic observation, not a
  guarantee of bounded scans or production capacity.
- A different cold backup and restore rehearsal into a fresh disposable
  stack verified unchanged exact schema, restored queue, consent,
  counters and cooldown, fail-closed acquisition on an expired restored
  reservation, refusal to restore twice, genuine owner sign-in with new
  target secrets and identical bytes in private storage.

Previous lock SHA-256
`c515ea4c089897f9def5b583916355f74eb54b13ab6220f7f8f16be1b2eca8e7` and
proposed successor lock SHA-256
`1a88e370084906c32b26d44999418949650ee714a618705a6df253f8bd7fba12` are the
only permitted transition. The activation must preserve both accepted
source ancestors and pass the unmodified protected-base guard.

Before any separately approved activation, route calls that share the
same upstream policy through reviewed coordination or keep automatic
fetches disabled. An operator must pause all callers before restore;
never resume a restored token. Preserve quotas and cooldown and keep
uncertain outstanding requests held until deliberately reconciled. Live
activation, shared egress coverage and production recovery evidence
remain out of scope.
