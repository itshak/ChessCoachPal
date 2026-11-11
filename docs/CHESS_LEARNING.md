# Chess learning and canonical material associations

ChessCoachPal stores exactly **one typed learning-material catalog** in `learning_materials`. A game, puzzle, drill, study chapter or external HTTPS link has a stable catalog ID, title and type-specific content. Student and lesson associations are stored in `material_links` with a foreign key to that ID, never as a second material resource record.

## Teacher workflow

The **Training & materials** page contains the typed material catalog and Chess Learning panel. Create and edit materials in the catalog, using the current game/PGN, puzzle/FEN, drill, study chapter or external-link form. In Chess Learning, choose a learner and optionally a lesson, refresh the material catalog, then **Attach learning material**. The attachment is an association, **not evidence that the material has been taught**. Reassign an association by selecting another material, or unlink it. Both actions preserve the material and all independently recorded teaching evidence.

The teacher can also record chess skill categories and observations. New teachers receive six starter categories. Teacher-authored observations are verified; AI proposals remain unverified until a human approves them in the browser. Changing observation text does not silently change provenance.

## Website / MCP parity

The website domain API and delegated MCP use the same ownership-scoped services for `materials.links.list`, `materials.links.create`, `materials.links.update`, `materials.links.unlinkImpact` and `materials.links.unlink`. The corresponding MCP tools are `ccp_v1_material_links_list`, `ccp_v1_material_links_create`, `ccp_v1_material_links_update`, `ccp_v1_material_links_unlink_impact` and `ccp_v1_material_links_unlink`. Creating a link requires a canonical material ID, target student or lesson, request UUID and explicit confirmation. Reassignment and unlinking require the latest revision.

The typed catalog is edited through the shared `/api/training/materials` routes and their MCP counterparts. No link operation edits material content. Both interfaces retain explicit teacher-attested material history in `material_teaching_evidence`, even after removing an association. The backend does not fetch or mirror provider content just to establish a link.

Tenant isolation is enforced with teacher-owned composite foreign keys, session membership constraints, RLS and service checks. Archived materials are not linkable, and a material with current associations cannot be archived. Authenticated browser/MCP E2E and the full parity checklist remain mandatory acceptance gates, not optional validations.

## Clean prelaunch schema

Per ADR-0001, this is a **fresh-install-only** schema. The independent `chess_learning_resources` table and old tool/action names are **deleted**, not read, translated, migrated or kept as aliases. A prelaunch development database created from a prior snapshot requires an **explicit full reset and reseed**; exporting/backing up actual user data requires the operator's informed decision before any destructive step. No automatic reset is performed by this change.
