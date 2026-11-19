# Design: enrollment-aware, source-precise import

## Existing schema and confirmed behavior
public.students stores canonical identities; public.workplace_enrollments joins teacher, workplace, student with unique triple; public.teaching_sessions.workplace_id attributes calendar lessons; public.ccp_historical_attendance_evidence has student_id, workplace_id, dated/aggregate evidence. SQL ccp_teacher_spreadsheet_commit currently inserts only students/guardians/receipts. SQL ccp_historical_attendance_commit intentionally does not require current enrollment. This is not a schema absence.

## Contract
Import request carries rows and explicit workplace resolution (per-row or batch), preview digest, and idempotency key. Resolution precedence: explicit per-row > explicit batch > confirmed active workplace context > unique workplace default; conflicting explicit assignments fail rather than silently override. Multi-workplace students are supported, including multiple explicit workplace IDs per row where source confirms them. Never infer current enrollment from historical attendance.

Preview returns row-by-row student resolution (create/match/ambiguous), proposed enrollments, already-enrolled outcomes, archived status, and errors. Commit revalidates current tenant ownership and context in the same SQL transaction; rows, enrollment changes, and receipt commit atomically. A retry returns the original receipt; changed payload with same key conflicts. The API and MCP call the same server service and RPC.

For existing names, prefer stable verified IDs; do not silently match ambiguous aliases. Existing student membership additions require explicit verified resolution. A workplace enrollment is a current relationship, not a historical attendance assertion. Archive status must never be changed implicitly by enrollment.

## CRM coordination
The proposed contacts/student_contacts/billing_accounts replacement is not implemented; keep new enrollment logic independent of guardian-specific fields and include import adapter rewrite in the coordinated CRM cutover. One-time production reconciliation uses counts and anonymized IDs by default, with teacher review before repair. Do not auto-enroll all students merely because historical evidence mentions a workplace.

## Tests
One workplace default; two workplaces missing choice; explicit per-row and batch selection; multiple memberships; wrong tenant; unknown workplace; ambiguous existing student; duplicate and retry; archived student; partial rollback; concurrent imports; ten historical dates per student; no fabricated calendar sessions; website/MCP parity and strict registry; isolated restored production audit. No production writes during proposal phase.
