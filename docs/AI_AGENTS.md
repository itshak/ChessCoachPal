# AI-agent integration architecture

**Implementation status:** The initial [OAuth/MCP foundation](../openspec/changes/archive/2026-11-07-connect-chatgpt-and-claude/proposal.md) and the [expanded coaching-tool implementation](../openspec/changes/archive/2026-11-08-expand-agent-coaching-tools/proposal.md) are GitHub-tested. Exact names, access rules and client setup are in [AI_CONNECTORS.md](AI_CONNECTORS.md). Real ChatGPT/Claude interoperability is still **unverified** and requires the maintainer's one-time [final local prepublication test](LOCAL_CLIENT_ACCEPTANCE.md).

**Primary interaction model:** Teachers naturally tell ChatGPT or Claude what happened in their teaching practice. A secure, installed ChessCoachPal tool connector translates those intentions into typed operations. Website pages show the saved state and provide full manual editing. We do **not** require a built-in chatbot inside the website.

## End-to-end flow

1. Teacher connects a supported AI client to their ChessCoachPal self-hosted instance through delegated authorization.
2. Client discovers the versioned tools and request schemas.
3. Teacher says, for example, "Yesterday's Tuesday beginners class had six students; one was absent; we practiced opposition."
4. Agent calls `sessions.search` / `students.search` to discover actual candidate records.
5. If context is ambiguous, the API returns `NEEDS_RESOLUTION`; the agent asks for the missing class, student, date or workplace, without writing.
6. The agent requests `attendance.preview` and `lesson_notes.preview`, showing the resolved teacher-owned IDs and proposed changes.
7. Validated commit commands save the result, atomically when possible, using an idempotency key and expected revision.
8. The tool returns a receipt. Opening the website shows exactly the same records, where the teacher can correct them.

## Implemented v0.1.0 coaching/learning tools and possible future extensions

| Namespace | Queries | Mutations |
| --- | --- | --- |
| Workplaces | list, get | create, update |
| Students | search, get, enrollments | create, update, enroll |
| Classes | list, get, membership | create, update, add/remove student |
| Sessions | calendar, get, conflicts | schedule, reschedule, cancel |
| Attendance | list, preview | record, bulk-preview, bulk-commit |
| Notes | get, history | upsert, correct, annotate |
| Compensation | preview, period totals | reconcile with confirmation |
| Materials | list, selected-study reference | link, unlink with confirmation |
| Reporting | preview, runs | export, publish with confirmation |
| Ratings | list, snapshot | refresh from authorized provider |

The implemented v0.1.0 subset covers workplace, student and group CRUD/enrollment, sessions, single-student attendance, notes, and learning proposal/link operations. The wider compensation, rating, publishing, bulk and export commands in this table are **future design ideas, not available MCP tools**. Use [the exact supported tool list](AI_CONNECTORS.md); never expose unrestricted table CRUD, open-ended SQL or bulk exports to a language model.

## Protocol and security

- Publish OpenAPI and an MCP-compatible tool gateway with equivalent versioned schemas when client support is verified.
- OAuth-compatible delegated credentials and scopes bind each client to a real teacher. Never pass database or service credentials to the model.
- Permission checks occur in code and RLS; return only necessary student fields.
- Request keys make retries safe; optimistic record revisions avoid overwrites.
- Confirmation tokens expire and bind exact proposed payloads, especially for payments, deletions and parent notifications.
- Store minimal audit metadata and consent/revocation state; do not log natural-language messages containing children's details.
- Accept both English and Hebrew inputs, but normalize exact dates/timezones and confirm ambiguity.
- Keep tool transport, prompt content and provider failures separate from database durability.
- Do not promise voice-initiated tool calls until tested in the relevant client.

## Acceptance evidence

Development acceptance uses **automated GitHub Actions only**: simulated delegated clients exercise MCP against fresh synthetic Supabase, with retries, tenant/scope denial, provider-outage fallback and website correction. The initial foundation and expanded coaching tools passed synthetic GitHub verification; the latter is archived in [change 2b](../openspec/changes/archive/2026-11-08-expand-agent-coaching-tools/proposal.md). **One manual release-only live-provider check** from the maintainer's machine, immediately before publishing v0.1.0, must demonstrate both real ChatGPT and Claude connections and website correction. See [LOCAL_CLIENT_ACCEPTANCE.md](LOCAL_CLIENT_ACCEPTANCE.md). Its absence does not keep earlier development changes open.
