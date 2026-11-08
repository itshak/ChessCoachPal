# ADR-0004 (proposed): Human verification of AI-proposed chess observations

- **Status:** Proposed — requires maintainer approval before treating as an ADR-0003 exception
- **Date:** 2026-11-08
- **Scope:** Chess observation provenance and explicit teacher verification
- **Related:** [ADR-0003](0003-mcp-website-business-parity.md), [active parity OpenSpec](../../openspec/changes/enforce-mcp-website-functional-parity/proposal.md)

## Context

An unverified observation created by an AI agent is marked with `source = agent`. A teacher's approval sets `verified_at` and `verified_by`, establishing a stronger evidence and trust claim. A model permitted to invoke ordinary write tools could supply `confirmed: true` itself; that argument alone does not prove the human teacher reviewed the observation. Allowing MCP to call the existing website approval mutation would risk an agent certifying its own assertions as human-approved.

## Proposed decision

1. Delegated MCP may list observations, propose **unverified** observations and correct their details with explicit teacher confirmation.
2. The action that sets `verified_at` / `verified_by` remains an authenticated, explicit teacher-originated browser operation; the MCP tool catalogue MUST NOT expose `ccp_v1_chess_observations_approve`.
3. MCP can subsequently list the observation and see its provenance and verification status. No raw SQL or direct trusted-state update path may bypass the browser approval boundary.
4. This is a **narrow trust/provenance exception**, not an exemption for category editing, notes, saved Lichess links or other chess business fields; those must retain MCP parity.
5. Full MCP-first approval may be introduced later only with a server-validated, human-interactive authorization receipt or equivalent independent human confirmation that an agent cannot synthesize by supplying tool arguments.

## Acceptance and audit

The delegated OAuth/browser E2E suite asserts the forbidden approval tool is absent, creates and corrects an agent proposal via MCP, performs explicit human-mode website approval and verifies the resulting status through MCP. The parity registry must label the exception and preserve the 93-case strict release blocker until reviewed. Acceptance of this ADR requires the product owner's explicit approval; a passing automated test does not replace that decision.

## Rejected alternative

A `coach:write` MCP approval tool with only `confirmed: true` would make approval easy from chat but does **not** establish the provenance of the teacher's affirmative action, making `verified_by` misleading. The exception prioritizes trustworthy teaching records over superficial route/tool symmetry.
