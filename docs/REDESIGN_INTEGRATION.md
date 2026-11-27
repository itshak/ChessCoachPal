# Consolidated production redesign — integration checkpoint

Pinned main 35413fa0989e3d92cc4875798947bafdf0179563. Source heads: #248 21224f9047ab63462eb1bfb8a626edbd421516ae, #270 05b8ae5f119c9630d0190e52f1ff01940bdaa053, #271 b38c8b455442c10b84beb9ff40f804877bdd1cc1, #272 ed178f28a9880f3d280ec6215f40b6cabfbc3d6c.

This candidate preserves all four agent branches, including binary assets, and reconciles the shared en/he/ru catalogs with a three-way merge. The original PRs remain untouched as provenance. #270 remains proposal-only: no library schema or baseline activation is authorized. #223 is unrelated and not included.

Integration is not acceptance. Resolve localization audit and navigation regression, shared layout adoption, reliable next-lesson retrieval and remaining domain-specific detail polish. Review exact combined CI, screenshot evidence, RTL, accessibility, draft navigation, current service parity, and all existing business operations before merge. No live deploy, migration, archive or cutover.
