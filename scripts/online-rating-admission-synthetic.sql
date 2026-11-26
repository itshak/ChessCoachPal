\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE f text:='public.ccp_rating_refresh_admit(uuid,uuid,uuid,text,text,bigint,text,text,integer,uuid,timestamptz)';
BEGIN
 IF current_setting('ccp.rating_synthetic',true) IS DISTINCT FROM 'disposable'
    OR has_function_privilege('anon',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN
  RAISE EXCEPTION 'Synthetic marker or admission role matrix mismatch';
 END IF;
END $$;
INSERT INTO public.students(id,teacher_id,name,lichess_username)
VALUES('ad360000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001',
       'Synthetic single-snapshot admission','SyntheticA');
SET LOCAL ROLE service_role;
DO $$
DECLARE
 t uuid:='00000000-0000-0000-0000-000000000001';
 student uuid:='ad360000-0000-4000-8000-000000000003'; consent uuid; job uuid; skipped uuid; lease jsonb; backfill jsonb;
 nonce uuid; revision bigint; until_at timestamptz;
 d text:=repeat('d',64);
BEGIN
 INSERT INTO public.student_rating_sync_consents(teacher_id,student_id,provider,source_username,enabled,consented_at)
 VALUES(t,student,'lichess','SyntheticA',true,clock_timestamp()) RETURNING id INTO consent;
 INSERT INTO public.student_rating_refresh_jobs
 (teacher_id,student_id,consent_id,provider,source_username,handle_revision,input_digest,idempotency_key,trigger_kind,created_at,run_after)
 VALUES(t,student,consent,'lichess','SyntheticA',1,d,gen_random_uuid(),'manual',clock_timestamp(),clock_timestamp())
 RETURNING id INTO job;
 lease:=public.ccp_rating_refresh_claim(t,job);
 IF lease IS NULL THEN RAISE EXCEPTION 'Fixture did not claim regular job'; END IF;
 nonce:=(lease->>'leaseToken')::uuid; revision:=(lease->>'handleRevision')::bigint;
 until_at:=(lease->>'leaseUntil')::timestamptz;
 IF NOT public.ccp_rating_refresh_admit(t,job,student,'lichess','SyntheticA',revision,d,'manual',1,nonce,until_at)
 OR public.ccp_rating_refresh_admit(t,job,student,'lichess','SyntheticA',revision,d,'manual',1,nonce,until_at+interval '1 second')
 OR public.ccp_rating_refresh_admit(t,job,student,'lichess','SyntheticA',revision,d,'manual',2,nonce,until_at)
 OR public.ccp_rating_refresh_admit(gen_random_uuid(),job,student,'lichess','SyntheticA',revision,d,'manual',1,nonce,until_at)
 THEN RAISE EXCEPTION 'Authoritative exact lease comparison mismatch'; END IF;
 INSERT INTO public.student_rating_refresh_jobs
 (teacher_id,student_id,consent_id,provider,source_username,handle_revision,input_digest,idempotency_key,trigger_kind,created_at,run_after)
 VALUES(t,student,consent,'lichess','SyntheticA',1,d,gen_random_uuid(),'history_backfill',clock_timestamp(),clock_timestamp())
 RETURNING id INTO skipped;
 backfill:=public.ccp_rating_refresh_claim(t,skipped);
 IF backfill IS NULL OR public.ccp_rating_refresh_admit(t,skipped,student,'lichess','SyntheticA',1,d,'history_backfill',1,
       (backfill->>'leaseToken')::uuid,(backfill->>'leaseUntil')::timestamptz)
 THEN RAISE EXCEPTION 'Unsupported background trigger admitted'; END IF;
 UPDATE public.student_rating_sync_consents SET enabled=false,revoked_at=clock_timestamp() WHERE id=consent;
 IF public.ccp_rating_refresh_admit(t,job,student,'lichess','SyntheticA',revision,d,'manual',1,nonce,until_at)
 THEN RAISE EXCEPTION 'Revoked synthetic lease admitted'; END IF;
 IF EXISTS(SELECT 1 FROM public.student_rating_refresh_receipts WHERE job_id IN(job,skipped)) THEN
  RAISE EXCEPTION 'Read-only admission wrote a receipt';
 END IF;
END $$;
ROLLBACK;
