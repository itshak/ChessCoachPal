\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_setting('ccp.rating_synthetic',true) IS DISTINCT FROM 'disposable' THEN
  RAISE EXCEPTION 'Must run as disposable synthetic fixture';
 END IF;
END $$;
INSERT INTO public.students(id,teacher_id,name,lichess_username,chesscom_username)
VALUES
 ('ad360000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','Synthetic lifecycle ratings','SyntheticA','SyntheticB'),
 ('ad360000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001','Synthetic split ratings','SyntheticA','SyntheticB');
INSERT INTO public.student_rating_sync_consents(teacher_id,student_id,provider,source_username,enabled,consented_at)
SELECT s.teacher_id,s.id,p.provider,p.handle,true,clock_timestamp()
FROM public.students s CROSS JOIN (VALUES ('lichess','SyntheticA'),('chesscom','SyntheticB')) p(provider,handle)
WHERE s.id IN ('ad360000-0000-4000-8000-000000000001','ad360000-0000-4000-8000-000000000002');
INSERT INTO public.student_rating_refresh_jobs
 (teacher_id,student_id,consent_id,provider,source_username,handle_revision,input_digest,idempotency_key,trigger_kind,created_at,run_after)
SELECT teacher_id,student_id,id,provider,source_username,handle_revision,repeat('d',64),gen_random_uuid(),'scheduled',clock_timestamp(),clock_timestamp()
FROM public.student_rating_sync_consents WHERE student_id='ad360000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
UPDATE public.students SET teacher_notes='Unrelated edit' WHERE id='ad360000-0000-4000-8000-000000000001';
UPDATE public.students SET lichess_username='ChangedOne' WHERE id='ad360000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF (SELECT count(*) FROM public.student_rating_sync_consents
     WHERE student_id='ad360000-0000-4000-8000-000000000001' AND enabled AND handle_revision=1)<>2 OR
    (SELECT count(*) FROM public.student_rating_sync_consents
     WHERE student_id='ad360000-0000-4000-8000-000000000002' AND (
       (provider='lichess' AND NOT enabled AND handle_revision=2) OR
       (provider='chesscom' AND enabled AND handle_revision=1)))<>2 THEN
  RAISE EXCEPTION 'Provider isolation or unrelated profile edit regression';
 END IF;
END $$;
SELECT (public.ccp_student_lifecycle_commit('ad360000-0000-4000-8000-000000000001','archive',
  (SELECT updated_at FROM public.students WHERE id='ad360000-0000-4000-8000-000000000001'),
  ARRAY[]::uuid[],gen_random_uuid(),'Synthetic rating archive',true))->>'mode';
SELECT (public.ccp_student_lifecycle_commit('ad360000-0000-4000-8000-000000000001','reactivate',
  (SELECT updated_at FROM public.students WHERE id='ad360000-0000-4000-8000-000000000001'),
  ARRAY[]::uuid[],gen_random_uuid(),'Synthetic rating reactivation',true))->>'mode';
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE row record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.students WHERE id='ad360000-0000-4000-8000-000000000001' AND archived_at IS NULL) THEN
  RAISE EXCEPTION 'Fixture did not reactivate learner';
 END IF;
 IF (SELECT count(*) FROM public.student_rating_sync_consents WHERE student_id='ad360000-0000-4000-8000-000000000001'
     AND NOT enabled AND revoked_at IS NOT NULL AND handle_revision=2)<>2 THEN
  RAISE EXCEPTION 'Archive did not retire both grants';
 END IF;
 FOR row IN SELECT id,teacher_id FROM public.student_rating_refresh_jobs WHERE student_id='ad360000-0000-4000-8000-000000000001' LOOP
  IF public.ccp_rating_refresh_claim(row.teacher_id,row.id) IS NOT NULL THEN
   RAISE EXCEPTION 'Archived job admitted after reactivation';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.student_rating_refresh_jobs WHERE student_id='ad360000-0000-4000-8000-000000000001'
       AND status='stale' AND attempt_count=0 AND lease_token IS NULL)<>2 THEN
  RAISE EXCEPTION 'Jobs were not retired without spending attempts';
 END IF;
END $$;
ROLLBACK;
