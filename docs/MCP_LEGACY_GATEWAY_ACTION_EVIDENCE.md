# Legacy coaching gateway — exhaustive website ↔ delegated MCP action evidence

**Source:** draft PR #56 (source candidate; exact E2E head must be accepted). This index is a source mapping, not live-provider acceptance. Every action must be proven by a real named authenticated Playwright test on the final combined commit. The mandatory `scripts/mcp-gateway-evidence.mjs` gate regenerates action-to-test membership from source and fails CI if an action or required MCP invocation is missing.

There are **38 gateway action discriminators**: **36 ordinary teacher actions** with named delegated MCP tools, and **2 narrow browser-only teacher-origin verification actions** (`chess.observations.create` and `chess.observations.approve`). Browser-only means signed-in human provenance, *not* silently missing MCP CRUD. All new business actions must be added to the action map and must pass the strict evidence gate in the same PR.

| Website action | MCP counterpart or approved exception | Authenticated behavior scenario |
| --- | --- | --- |
| `workplaces.list` | `ccp_v1_workplaces_list` | [`PARITY-workplaces-list lists owned workplace details without foreign disclosure`](../e2e/parity-workplaces.spec.ts) |
| `workplaces.create` | `ccp_v1_workplaces_create` | [`PARITY-workplaces-create preserves timezone currency and locale on both clients`](../e2e/parity-workplaces.spec.ts) |
| `workplaces.update` | `ccp_v1_workplaces_update` | [`PARITY-workplaces-policy edits timezone locale currency and policy with revision`](../e2e/parity-workplaces-extended.spec.ts) |
| `workplaces.enroll` | `ccp_v1_workplaces_enroll` | [`PARITY-workplaces-enroll records only owned students through both surfaces`](../e2e/parity-workplaces.spec.ts) |
| `workplaces.unenroll` | `ccp_v1_workplaces_unenroll` | [`PARITY-gateway-student-search-and-workplace-unenroll uses both real action transports`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `workplaces.enrollments` | `ccp_v1_workplaces_enrollments` | [`PARITY-gateway-student-search-and-workplace-unenroll uses both real action transports`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `students.create` | `ccp_v1_students_create` | [`PARITY-workplaces-enroll records only owned students through both surfaces`](../e2e/parity-workplaces.spec.ts) |
| `students.update` | `ccp_v1_students_update` | [`PARITY-students-route-basic-revision-update shares website and MCP receipt`](../e2e/parity-students.spec.ts) |
| `students.search` | `ccp_v1_students_search` | [`PARITY-gateway-student-search-and-workplace-unenroll uses both real action transports`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `groups.list` | `ccp_v1_groups_list` | [`PARITY-gateway-group-create-enroll has reverse-direction membership readback`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `groups.create` | `ccp_v1_groups_create` | [`PARITY-gateway-group-create-enroll has reverse-direction membership readback`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `groups.update` | `ccp_v1_groups_update` | [`PARITY-groups-create-update keeps class rename and revision identical`](../e2e/parity-groups.spec.ts) |
| `groups.enroll` | `ccp_v1_groups_enroll` | [`PARITY-gateway-group-create-enroll has reverse-direction membership readback`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `groups.unenroll` | `ccp_v1_groups_unenroll` | [`PARITY-groups-memberships preserves frozen session roster after removal`](../e2e/parity-groups.spec.ts) |
| `groups.members` | `ccp_v1_groups_members` | [`PARITY-gateway-group-create-enroll has reverse-direction membership readback`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `sessions.list` | `ccp_v1_sessions_list` | [`PARITY-gateway-sessions-list matches one current frozen session on website and MCP`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `sessions.create` | `ccp_v1_sessions_create` | [`PARITY-sessions-standard-creation covers private and frozen group sessions on both transports`](../e2e/parity-session-operations.spec.ts) |
| `sessions.createAdHoc` | `ccp_v1_sessions_ad_hoc_create` | [`PARITY-ad-hoc-three-students freezes exact roster across website and MCP`](../e2e/parity-ad-hoc.spec.ts) |
| `sessions.update` | `ccp_v1_sessions_edit` | [`PARITY-completion-cannot-bypass rejects ordinary website/MCP and direct RLS completion`](../e2e/parity-session-completion.spec.ts) |
| `sessions.complete` | `ccp_v1_sessions_complete` | [`PARITY-sessions-complete-atomic rolls back stale roster and replays across website/MCP`](../e2e/parity-session-completion.spec.ts) |
| `sessions.participants` | `ccp_v1_sessions_participants` | [`PARITY-groups-memberships preserves frozen session roster after removal`](../e2e/parity-groups.spec.ts) |
| `attendance.list` | `ccp_v1_attendance_preview` | [`PARITY-sessions-complete-atomic rolls back stale roster and replays across website/MCP`](../e2e/parity-session-completion.spec.ts) |
| `attendance.record` | `ccp_v1_attendance_record` | [`PARITY-attendance-individual records frozen participant status through both interfaces`](../e2e/parity-session-operations.spec.ts) |
| `chess.categories.list` | `ccp_v1_chess_categories_list` | [`PARITY-chess-categories compares configuration create rename and reorder`](../e2e/parity-learning.spec.ts) |
| `chess.categories.create` | `ccp_v1_chess_categories_create` | [`PARITY-chess-categories-lifecycle creates renames reorders and safely deletes unused categories`](../e2e/parity-chess-category-delete.spec.ts) |
| `chess.categories.update` | `ccp_v1_chess_categories_update` | [`PARITY-chess-categories compares configuration create rename and reorder`](../e2e/parity-learning.spec.ts) |
| `chess.categories.deleteImpact` | `ccp_v1_chess_categories_delete_impact` | [`PARITY-chess-categories-lifecycle creates renames reorders and safely deletes unused categories`](../e2e/parity-chess-category-delete.spec.ts) |
| `chess.categories.delete` | `ccp_v1_chess_categories_delete` | [`PARITY-chess-categories-lifecycle creates renames reorders and safely deletes unused categories`](../e2e/parity-chess-category-delete.spec.ts) |
| `chess.observations.list` | `ccp_v1_chess_observations_list` | [`PARITY-gateway-observation-edit preserves unverified provenance in both clients`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `chess.observations.create` | Secure teacher-browser attestation exception | [`PARITY-gateway-observation-browser-approval-requires-person-rejects-bearer-forgery`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `chess.observations.propose` | `ccp_v1_chess_observations_propose` | [`PARITY-chess-observations-proposal remains unverified until explicit browser approval`](../e2e/parity-observations-and-links.spec.ts) |
| `chess.observations.update` | `ccp_v1_chess_observations_update` | [`PARITY-gateway-observation-edit preserves unverified provenance in both clients`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `chess.observations.approve` | Secure teacher-browser attestation exception | [`PARITY-gateway-observation-browser-approval-requires-person-rejects-bearer-forgery`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `materials.links.list` | `ccp_v1_material_links_list` | [`PARITY-gateway-material-unlink-impact-and-delete preserves catalog across browser and MCP`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `materials.links.create` | `ccp_v1_material_links_create` | [`PARITY-material-links shares the typed catalog and revision guarded associations`](../e2e/parity-learning.spec.ts) |
| `materials.links.update` | `ccp_v1_material_links_update` | [`PARITY-material-links shares the typed catalog and revision guarded associations`](../e2e/parity-learning.spec.ts) |
| `materials.links.unlinkImpact` | `ccp_v1_material_links_unlink_impact` | [`PARITY-gateway-material-unlink-impact-and-delete preserves catalog across browser and MCP`](../e2e/parity-gateway-action-coverage.spec.ts) |
| `materials.links.unlink` | `ccp_v1_material_links_unlink` | [`PARITY-gateway-material-unlink-impact-and-delete preserves catalog across browser and MCP`](../e2e/parity-gateway-action-coverage.spec.ts) |

The `GET /api/agent/v1` discovery/identity endpoint is additionally checked by `PARITY-gateway-discovery-get-is-authenticated-and-MCP-contract-remains-callable` in `e2e/parity-gateway-action-coverage.spec.ts`. A true full-product release is still blocked by canonical lesson/calendar writer cutover, four historical checklist cases, and final merged-main strict verification; the table does not waive those obligations.
