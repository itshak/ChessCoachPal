# Archive decision — 2026-11-08

**Outcome: SUPERSEDED / PARTIAL, NOT A COMPLETED RELEASE.**

This release-only proposal was the last active OpenSpec change after automated Milestones 1–5 and agent-tool change 2b had been archived. Its five release tasks 5.8–5.12 were still unchecked when archived. To record the genuine intermediate deployment milestone without claiming a first public release, the tasks and binding first-release scenarios were transferred intact to [the active release successor](../../../complete-v0-1-0-release-gates/proposal.md).

## Verified working hosted MCP demonstration

- GitHub main `118f90f4dcb44b721efbb69fbec5e6fbfbcc3a0b`; security fix merged as PR #16.
- Vercel demo project `chess-teaching-assistant`; confirmed READY deployment `dpl_BJtbVgjG55R6wSJjugMZg6s5DKv1` with public HTTPS origin `https://chess-teaching-assistant-itshaks-projects.vercel.app` (demo only).
- Isolated Supabase `chesscoachpal-demo` project ref `hfcrmaxgpvbmulzkzajn`; canonical schema and anonymous privileged-RPC revocation applied, with tenant RLS.
- Temporary real HTTPS smoke from Vercel sandbox: homepage 200; authorization/resource metadata 200; unauthenticated MCP initialize 401 + WWW-Authenticate; GET MCP 405; insecure OAuth redirect rejected; OAuth dynamic client registration 201 and persisted to Supabase; consent page 200; invalid token 400; Supabase Auth health 200 with public API key. Synthetic registration deleted and test sandbox stopped.
- The maintainer's real Codex MCP session searched/created synthetic student Armond, created Marshal workplace and enrolled Armond; direct Supabase query confirmed exactly one matching student, one workplace and one corresponding enrollment.
- Merged-main GitHub CI, E2E (26 passed / 5 skipped), security scan, Compose and DB/file backup-restore all green for commit 118f90f (Actions runs 42452846106, 42452846108, 42452846075, 42452846058, 42452846063).

## Incomplete / deliberately transferred

- Real ChatGPT **and** Claude delegated consent, read/write, shared website correction, revocation and tenant isolation; Codex does not replace those checks.
- Historical public GitHub Homepage/private-URL and Actions log/artifact residual reviews, older inaccessible refs, redistribution/asset-license approval, and release checklist signoff.
- Reviewed version 0.1.0 bump, CHANGELOG, annotated tag, GitHub Release, and matching downloadable source archives.
- Demo tool UX gaps: students_search requires nonempty search; recurring weekly lesson/availability is unsupported. These are potential future development proposals, not evidence of completed release requirements.

**Release stays at package version `0.0.0`; no v0.1.0 tag or Release was created.**