# Known risks and deferred improvements

This register records **understood but not yet resolved** security, operational, and technical limitations that warrant future review, especially when the safe fix depends on upstream software or a risky infrastructure change. It complements, **does not replace**, actionable GitHub issues, incident response, security advisories, OpenSpec work, and release gates.

## How to maintain this register

- Give each entry a stable ID, status, observation date, severity/priority **with assumptions**, impacted components, and a GitHub issue link.
- Distinguish **observed behavior** from hypothetical exploitation and from verified mitigations. Document immediate risk-reduction steps, future repair choices, upstream tracking, and measurable acceptance criteria.
- Name an explicit **review trigger** (upstream release, deployment change, incident, or expansion of exposure). Recheck at relevant release/security reviews; don't silently treat a deferred issue as fixed.
- **Never store credentials, environment dumps, user data, infrastructure access details, or private business plans** here. Security-sensitive implementation details belong in appropriately restricted systems.
- When fixed: update the entry with tested evidence and deployment/version, mark resolved, and close the corresponding GitHub issue. A passing source-level check alone is not proof of the deployed runtime state.
- Deferral is **not** a waiver for exploited vulnerabilities or severe user-data exposure; escalate immediately if the risk changes.

## Register

| ID | Issue | Priority | Status | Review trigger |
| --- | --- | --- | --- | --- |
| KR-001 | [Coolify Compose injects Auth SMTP credential into unrelated containers](#kr-001-coolify-shared-compose-environment) ([#91](https://github.com/itshak/ChessCoachPal/issues/91)) | Medium, conditional | Open — upstream-dependent | Coolify environment-injection update, Compose deployment change, or evidence of compromise |

### KR-001: Coolify shared Compose environment

- **Observed:** 2026-11-17 on the live v0.1.4 deployment, according to [issue #91](https://github.com/itshak/ChessCoachPal/issues/91).
- **Scope:** Git-based Coolify Compose deployment; GoTrue Auth SMTP secret; app and other service containers.
- **Status:** **Open / not remediated**. No public browser exposure or Git-repository leak has been established. Do not assume live isolation is in place.
- **Priority rationale:** **Medium under current assumptions**, not a demonstrated active exploit. It becomes urgent if container access, secret disclosure, abusive mail sending, or a broader credential leak is suspected.

**Observed root cause.** The checked-in `docker-compose.coolify.yml` maps Coolify-managed `AUTH_SMTP_PASS` to `auth.environment.GOTRUE_SMTP_PASS`. Coolify's *generated* deployment Compose additionally places the global `.env` in every service's `env_file`, causing `AUTH_SMTP_PASS` to appear in unrelated containers' Docker `Config.Env`, including the web app. The app image itself did not contain that key in the issue's inspection. This is a **container-runtime privilege-boundary issue**, not evidence that a client/browser can access the password. Prior removal of an empty app assignment made the SMTP field editable in Coolify; do not reintroduce `AUTH_SMTP_PASS: ''` just to mask the leak.

**Threat model and impact.** If an attacker first obtains access to an unintended container (for example by exploiting an independent application vulnerability), the injected SMTP secret can facilitate unauthorized mail sending, phishing impersonation, provider quota exhaustion, account suspension, or sender-reputation damage. Exposing a credential in a container does **not by itself** mean an unauthenticated visitor can retrieve it; the SMTP credential alone does not automatically grant database or mailbox access. This risk coexists with other legitimately scoped privileged runtime secrets and does not replace their protection.

**Interim risk reduction (operator checks, not a fix):**

1. Use a dedicated, unique SMTP credential and least-privileged provider account; check provider-supported daily quotas, alerts, and sending restrictions.
2. Keep Coolify, the host, container images, and application dependencies patched. Restrict access to Docker, the Coolify admin interface, and deployment credentials.
3. Monitor anomalous email traffic and provider account activity; rotate SMTP credentials promptly on suspected exposure. Password rotation **does not** eliminate cross-container injection on subsequent deployment.
4. Preserve functional verification of registration/verification and recovery mail after credential or deployment changes. Do not output secret values in logs, CI, issues, or screenshots.

**Future remediation options (not yet validated):**

1. **Preferred:** follow [upstream Coolify issue #7655](https://github.com/coollabsio/coolify/issues/7655) for a released, tested implementation that scopes deployment environment variables per service. Proposed upstream PRs [#8716](https://github.com/coollabsio/coolify/pull/8716) and [#8799](https://github.com/coollabsio/coolify/pull/8799) were closed unmerged when investigated on 2026-11-17; **do not assume a fix ships** without checking the running Coolify version and generated Compose.
2. **Alternative:** evaluate a supported deployment configuration that does not inject the global environment into each service (e.g., raw Compose or explicitly per-service files) **only in an isolated staging environment first**. Preserve Coolify-managed editability, HTTPS proxy labels/domains, network isolation, image builds, migration ordering, persistent volumes, and rollback. Do not switch the live resource based on a textual Compose diff alone.
3. Separately inventory the unnecessary exposure of **other** cross-service secrets and open appropriately scoped follow-up work; avoid dropping secrets required by legitimate service workflows.

**Acceptance criteria before calling fixed:**

- Render the **actual Coolify-generated** Compose for the deployed resource; verify no global `.env` is injected into unintended containers and no secret is leaked through build arguments, images, or build logs.
- Inspect running Docker container `Config.Env` **key presence only** (never print values): `AUTH_SMTP_PASS` absent from app, gateway, db, rest, storage, migrate, and cron if enabled. The Auth container receives its necessary `GOTRUE_SMTP_PASS` and no unexpected duplicate `AUTH_SMTP_PASS`.
- Validate SMTP verification and password-recovery delivery, SMTP credential rotation, and normal web/MCP functionality.
- Record tested Coolify version, deployment evidence (redacted), successful rollback readiness, and closure references in [#91](https://github.com/itshak/ChessCoachPal/issues/91).

**Review triggers:** Upstream Coolify issue resolution or release notes mentioning Compose environment injection; upgrade of Coolify; change to deployment strategy; suspected container compromise; broadened public beta. Reassess at the next relevant operational/security release review, even without an upstream change.
