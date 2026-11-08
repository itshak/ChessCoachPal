# Future public ChatGPT Plugin Directory route — ChessCoachPal

**Status:** future SaaS/public-directory distribution, **NOT** submitted or approved; updated 2026-11-08.

This is distinct from the working disposable Vercel + Supabase Codex demo, from using a private custom MCP server, and from the eventual v0.1.0 GitHub Release. The directory was migrated into the **universal Plugin Directory shared by ChatGPT and Codex** in July 2026. A public plugin may package an MCP server alone, with no UI or bundled skill. It must go through OpenAI review and approval, and the publisher chooses when to publish afterward.

Official guides:
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/plugin-guidelines
- https://help.openai.com/en/articles/20001256

## Decision: recommend public listing after the hosted SaaS is ready

**Recommendation:** Implement the full self-hostable teacher/MCP workflow and student/chess materials capabilities first. Maintain the private/custom MCP route (already used in real Codex testing). **Defer official ChatGPT Plugin Directory publication until a multi-teacher ChessCoachPal-hosted SaaS can reliably offer central sign-up, OAuth, tenant isolation, privacy/support and dependable service**. The planning target is **at/after the public SaaS v1.0.0 launch**, not during the disposable demo or unfinished v0.1.0 self-hosted release.

**This is a strategy, not a technical dependency:** OpenAI does not require our GitHub repository to reach semantic version 1.0.0 before review. We *could* submit during an earlier controlled hosted beta if all production/security/privacy requirements and reviewer accounts are complete. The user benefit of being listed comes from not needing to paste an MCP URL, rather than the source-code version number. A public plugin could also support approved customer-specific origins only through a separately reviewed integration; our default plan is one stable SaaS URL. Don't promise any Plus account or action availability without actual tested plugin-install/write capability.

See [full proposed chess-trainer MCP workflow](MCP_WORKFLOW_ROADMAP.md) and [active development proposal](../openspec/changes/support-conversational-lesson-and-lichess-workflows/proposal.md).

## Architecture decision to make before submitting

Prefer a **production ChessCoachPal cloud service with one stable universal HTTPS MCP URL**, supporting many independent authenticated teacher accounts with strict tenant isolation and consent. A disposable Vercel project and test Supabase database do not satisfy production reliability/privacy/availability expectations; keep them only for synthetic integration. A published app is not the same as distributing an open-source self-host image. OpenAI's template URLs for customer-specific MCP origins are available only to approved/trusted developers, not a general self-hosting escape hatch. Self-host users may use custom MCP connections where their ChatGPT/Codex/Claude plans support them.

## Required preparation

1. Implement mature student listing and recurring scheduling UX or intentionally narrow the public plugin's stated capabilities. Improve MCP tool names, descriptions and structured output; ensure accurate `readOnlyHint`, `openWorldHint` and `destructiveHint` for each tool. Keep confirmations for writes and tenant-scoped OAuth.
2. Separate a production domain and infrastructure from this disposable demo. Validate rate limits on dynamic registration/sign-up, secret handling, least-privilege Supabase access, isolation, backup/restore, data deletion, monitoring, retries and secure OAuth refresh/revocation. Provide reviewer-ready synthetic accounts; never expose real teacher/student records.
3. Publish coherent **privacy policy, terms, support URL, public product website and branding**; document data controller/operator, what prompts and student data the app receives/retains, deletion and support. Complete historical privacy/third-party licensing review and the project release gate separately.
4. Establish publisher identity in OpenAI Platform (individual or business verification). Ensure submission organization role has **Apps Management Write** (owners normally already have it).
5. In the **plugin submission portal** at https://platform.openai.com choose **Create plugin → With MCP**, universal endpoint, OAuth configuration; complete domain verification if prompted (token at `/.well-known/openai-apps-challenge`), use **Scan Tools**, and fix tool-schema, security and metadata findings. Workspace domain restrictions may need OIDC `openid`, `email`, UserInfo `email_verified` support.
6. Prepare logo, public listing, categories, starter prompts, **at least five positive and three negative reproducible test cases** with expected tool behavior and test credentials that don't require MFA/email confirmation, and countries of availability.
7. Submit for OpenAI review, address any feedback, then **publish after approval**. Approval is not guaranteed. Keep the MCP endpoint available and maintain public listing/credentials and change review.

## User experience after approval

A teacher finds **ChessCoachPal** in ChatGPT's Plugin Directory, installs it, selects **Connect**, signs in to their ChessCoachPal account through OAuth, approves scopes, then uses `@ChessCoachPal` (or the plugin picker) in chat for authorized teacher-workflow tools. They do **not** paste their own MCP URL or use Codex. Directory visibility is broad, but installation, write actions and particular surfaces may still vary by ChatGPT plan, region, admin policies or rollout. Do not promise that every Plus user automatically receives every write action before validating on a real Plus account.

**Do not submit the disposable demo for public review or confuse the GitHub v0.1.0 release with OpenAI Directory publication.**
