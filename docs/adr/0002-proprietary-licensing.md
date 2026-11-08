# ADR-0002: Proprietary licensing for ChessCoachPal development

- **Status:** Accepted
- **Date:** 2026-11-08
- **Decision:** Distribute original ChessCoachPal work under proprietary terms going forward, while preserving required prior and third-party licensing rights.
- **Repository visibility:** Public for development and GitHub Actions; privacy may be reconsidered closer to commercial launch.

## Context

ChessCoachPal is an unreleased, MCP-first chess-teacher application. The intended business model is a generous hosted free offering and paid features that automate professional teaching administration. The maintainers do not intend to offer an unrestricted open-source license for future original work.

## Decision

1. Replace the top-level MIT `LICENSE` with a proprietary notice for original ChessCoachPal material where the copyright holders have the rights to do so.
2. Keep CogNote's original MIT copyright and full permission notice in `THIRD_PARTY_NOTICES.md`; retain upstream attribution and any embedded third-party notices.
3. Recognize that prior MIT grants for copies/revisions already distributed are not revoked by a new license notice. This decision does not purport to change the rights of third-party copyright holders or contributions without sufficient relicensing rights.
4. Preserve the complete Git history. No rebase, force push, tag removal, or branch rewriting is authorized by this ADR.
5. Keep the GitHub repository **public** and existing GitHub Actions workflows unchanged during the current development stage. Consider making the repository private closer to v1.0.0 or commercial launch.
6. Treat Docker/self-hosting documents as technical operational instructions, not as authorization to redistribute or deploy proprietary source. Public GitHub source archives likewise do not grant additional permissions.
7. Continue the required website/MCP feature parity, security checks, and v0.1.0 release gates. The proprietary decision does not implement or commit to particular SaaS plans, entitlements, prices, or hosted features.

## Consequences

- This repository is **source-visible proprietary software with MIT-licensed components**, not a fully MIT-licensed or OSI-open-source project.
- Only authorized uses of proprietary components are permitted, while existing MIT/third-party rights remain intact.
- The legal ownership/third-party asset review remains part of the prepublication release process; this policy statement does not replace legal review.
