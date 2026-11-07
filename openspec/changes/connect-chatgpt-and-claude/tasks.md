# Tasks — connect-chatgpt-and-claude

Check individual tasks only with main-merged code and observed verification; real-client tasks additionally require sanitized actual-client demonstrations in docs/STATUS.md.

**Milestone 2 checkpoint (not accepted):** PR #5 has passing synthetic [CI 42410931916](https://github.com/itshak/ChessCoachPal/actions/runs/42410931916) and [E2E 42410931858](https://github.com/itshak/ChessCoachPal/actions/runs/42410931858). Implemented subset: MCP/OAuth discovery, client revocation, teacher-scoped read tools, singular attendance and session-note writes with idempotency and optimistic revisions. Real ChatGPT/Claude demonstrations, broader CRUD/scheduling/resources, independent MCP cross-teacher evidence and security acceptance remain open. Keep this change active; do not archive prematurely.

- [ ] 2.1 Finalize a typed command/query catalogue shared by web UI and tool transports; define schemas for initial operations.
- [ ] 2.2 Publish machine-readable MCP tool discovery and suitable OpenAPI schema, checking both from one source contract.
- [ ] 2.3 Build supported HTTPS MCP transport with versioned tool names and structured success/error payloads.
- [ ] 2.4 Implement delegated teacher sign-in/authorization with OAuth-compatible redirect, scopes, expiry and revocation; no exposed service-role credentials.
- [ ] 2.5 Add teacher/workplace-scoped read tools for students, workplaces, groups, sessions, participants, notes and resource references.
- [ ] 2.6 Add write tools for student/workplace/group updates, scheduling and attendance/note recording using the same domain service.
- [ ] 2.7 Implement stable-ID disambiguation, explicit missing-information responses and no writes on unresolved names.
- [ ] 2.8 Implement request idempotency, optimistic revisions/CONFLICT handling, and safe retries for every supported mutating operation.
- [ ] 2.9 Add attendance/bulk preview and signed expiring confirmation, or explicitly exclude any unsupported high-impact action from the tool catalogue.
- [ ] 2.10 Save privacy-minimized audit receipts without prompt/student text or token leakage; test errors and forbidden output.
- [ ] 2.11 Demonstrate one **real ChatGPT-compatible** client flow, capturing client version, authorization, create/edit tool call and website correction.
- [ ] 2.12 Demonstrate one **real Claude-compatible** client flow with the same proof, and document both setup guides honestly.
- [ ] 2.13 Verify two-teacher isolation, revocation, duplicate retries, ambiguous names, concurrency and AI-provider-unavailable website fallback.
- [ ] 2.14 Record passing contract/integration test and client evidence in docs/STATUS.md; do not advertise voice-tool capability unless separately tested.

