-- Identity-only snapshots allow checking every affected relationship without
-- leaking email, tokens, private notes or child records to CI logs/artifacts.
SELECT 'archived:'||count(*) FROM public.students WHERE archived_at IS NOT NULL;
SELECT 'teacher:'||count(*) FROM public.teachers;
SELECT 'students:'||count(*) FROM public.students;
SELECT 'guardians:'||count(*) FROM public.guardians;
SELECT 'guardian_tokens:'||count(*) FROM public.guardians WHERE portal_token IS NOT NULL;
SELECT 'workplaces:'||count(*) FROM public.workplaces;
SELECT 'group_roster:'||count(*) FROM public.group_enrollments;
SELECT 'sessions:'||count(*) FROM public.teaching_sessions;
SELECT 'attendance:'||count(*) FROM public.session_attendance;
SELECT 'notes:'||count(*) FROM public.session_notes;
SELECT 'invoices:'||count(*) FROM public.invoices;
SELECT 'invoice_items:'||count(*) FROM public.invoice_items;
SELECT 'credits:'||count(*) FROM public.credit_packages;
SELECT 'events:'||count(*) FROM public.events;
SELECT 'event_rsvps:'||count(*) FROM public.event_rsvps;
SELECT 'student_rating_snapshots:'||count(*) FROM public.student_rating_snapshots;
SELECT 'archive_same_id:'||(SELECT count(*) FROM public.students
 WHERE id='10000000-0000-0000-0000-000000000005'
   AND archived_at='2026-11-01T00:00:00Z');
SELECT 'invoice_links:'||(SELECT count(*) FROM public.invoice_items li
 JOIN public.invoices i ON i.id=li.invoice_id
 JOIN public.guardians g ON g.id=i.guardian_id
 JOIN public.credit_packages c ON c.invoice_id=i.id);
SELECT 'portal_links:'||(SELECT count(*) FROM public.event_rsvps e
 JOIN public.events ev ON ev.id=e.event_id
 JOIN public.guardians g ON g.id=e.guardian_id WHERE g.portal_token IS NOT NULL);
