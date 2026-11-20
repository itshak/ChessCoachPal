# Tasks: workplace context and Studio retirement

> **Execution prerequisite:** First complete [`2026-11-19-freeze-unified-saas-schema-and-regressions`](../2026-11-19-freeze-unified-saas-schema-and-regressions/proposal.md), including canonical schema freeze and regression verification. This change implements remaining functionality against that schema; do not add ad hoc schema DDL.


> **Deployment terminology (ADR-0018):** ChessCoachPal is operator-only SaaS; any "self-hosting" references here describe our infrastructure/CI, never customer-hosted product support. [Current policy](../../docs/adr/0018-operator-only-saas-and-tenant-scaling.md).

- [ ] Inventory workplace filters and every studio_policies/Studio route/setting consumer including portal, billing, emails, scheduling, imports, reports, MCP, backup/export and current beta data.
- [ ] Specify typed teacher-global defaults versus workplace-local policy/branding settings and override hierarchy; prohibit policy JSON from silently granting financial behavior.
- [ ] Update canonical baseline for teacher selected_workplace_id preference, typed settings/storage as needed, owner FKs/RLS, Personal Teaching default and clean removal of obsolete Studio-specific physical concepts.
- [ ] Write reviewed one-time live mapping of studio policy into teacher/workplace defaults; preserve real current and historic sessions/timezones and existing named workplaces; backup/restore rehearsal required.
- [ ] Implement shared workplace-context GET/SET and validate inaccessible/deleted selections, with equivalent website and ccp_* MCP operations and strict field propagation.
- [ ] Add persistent global workplace selector in TeacherNav, All option, visible selected context, dashboard workplace count navigation and separate Manage Workplaces access.
- [ ] Scope dashboard, student roster vs historic membership, current schedule, lessons, training/materials defaults, reporting and daily action queue through common workplace filter semantics.
- [ ] Keep group membership independent: groups may be created in Free within Personal Teaching; no additional workplace privilege from group creation.
- [ ] Remove Studio-as-product navigation and terminology, relocate account/business settings and update recipient-facing portal language/settings without granting new access.
- [ ] Test one student in school and private, multiple groups, mixed timezones, moved/archived students, deleted selection, All deduping and stable historic attribution.
- [ ] Test hosted beta transition does not strand existing workplace data or prematurely enforce unapproved Pro rules; self-host remains unrestricted.
- [ ] Run baseline+restored copy, strict parity, authenticated E2E, locale/RTL, security, Compose, backup/restore; document merged-main evidence and archive only after acceptance.
