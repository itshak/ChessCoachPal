# AI-agent integration architecture

**Implementation roadmap:** [connect-chatgpt-and-claude OpenSpec](../openspec/changes/connect-chatgpt-and-claude/proposal.md). A stateless MCP/OAuth gateway is being implemented in PR #5. Its safe subset and setup instructions are documented in [AI_CONNECTORS.md](AI_CONNECTORS.md). Real ChatGPT and Claude client connections are not yet verified.

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

## Proposed broader versioned tool catalogue (not yet implemented)

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

Every mutation maps to a reusable domain command. Do not expose unrestricted table CRUD, open-ended SQL or bulk exports to a language model.

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

Demonstrate actual operation from a ChatGPT-compatible client and a Claude-compatible client into the same self-hosted database, followed by website correction, repeated-call idempotency, scope denial and provider-outage fallback. Until both client demonstrations pass, Milestone 2 **remains open**. The implemented subset and unsupported operations are described in [AI_CONNECTORS.md](AI_CONNECTORS.md).
