# Workplace context / Studio retirement — implementation in progress

**Historical checkpoint:** Draft PR #104 at the time of this note. Subsequent source completion and hosted evidence are recorded in [SOURCE_ACCEPTANCE.md](SOURCE_ACCEPTANCE.md); this historical checklist does not describe remaining functional work or certify deployment.

## Delivered initial source slice

- Replaced the inherited `studio_policies` physical model with first-class `teacher_settings` in the single current canonical SQL baseline. The corresponding generated TypeScript `TeacherPolicy`, service and all current runtime SQL readers/writers use the new physical table without a compatibility view or dual writers.
- Replaced `studio_name`, `studio_website`, `studio_contact`, `studio_info` with `business_*` typed fields; website and MCP use `businessName`, `businessWebsite`, `businessContact`, `businessInfo`. Secret masking/encryption and existing policy read/write authorization remain in one shared service.
- Removed `/studio` teacher page and old Studio settings component, added `/settings` and `BusinessSettingsForm`, changed navigation and auth routing, replaced old MCP `ccp_studio_*` tools with current `ccp_teacher_settings_{get,update}` and `ccp_teacher_credentials_handoff`; no old tool aliases. Source and E2E contracts updated together.
- en/he/ru settings heading now identifies teacher/business defaults rather than a Studio entity. Obsolete unused Studio policies display component removed; the private scoped guest portal no longer uses Studio branding.
- Canonical baseline checksum, typecheck, i18n namespace/typed checks, source parity and normal schema tests updated. **Release scan remains red** until old guardian/family consumers are removed and workplace-global context is implemented.

## Remaining requirements / blockers

- Introduce teacher-global selected workplace preference with safe stale/foreign workplace fallback, including `All Workplaces` and `Personal Teaching` semantics; implement shared service and website/MCP GET/SET.
- Apply consistent workplace scoping to dashboard, students, lessons, schedule, materials, reports and action queue; separate current membership vs historic attribution and do not erase history. Add accessible global selector and RTL/mobile E2E.
- Move applicable teacher-setting defaults to typed workplace-local policy overrides, leaving credentials, locale/security/notification settings teacher global. Never let loose JSON policy grant financial/payment access.
- Test private, school, mixed, archived, multi-group and mixed-timezone record semantics and tenant isolation; update financial and contact/portal dependent services. Complete full exact-head/merged-main CI and synthetic backup/restore before archive.
- No real database migrated, reset or deployed, and no live private-beta schema claims were made. Final operator approves one last cutover/reimport under ADR-0017.
