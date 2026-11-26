BEGIN;
DO $$
DECLARE f text:='public.ccp_online_rating_enqueue_due(text,integer)';
BEGIN
 IF current_setting('ccp.rating_synthetic',true) IS DISTINCT FROM 'disposable'
 OR has_function_privilege('anon',f,'EXECUTE')
 OR has_function_privilege('authenticated',f,'EXECUTE')
 OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN
  RAISE EXCEPTION 'fixture or schedule ACL mismatch';
 END IF;
END $$;

INSERT INTO public.students(id,teacher_id,name,lichess_username,chesscom_username)
 SELECT ('ad370000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000001','Synthetic cadence '||n,
 'SyntheticA'||n,'SyntheticB'||n FROM generate_series(1,5) n;

UPDATE public.online_rating_provider_budget SET enabled=false WHERE provider='lichess';
SET LOCAL ROLE service_role;
DO $$
BEGIN
 IF public.ccp_online_rating_enqueue_due('lichess',1)->>'status' IS DISTINCT FROM 'paused'
 THEN RAISE EXCEPTION 'disabled scheduling'; END IF;
END $$;
RESET ROLE;
UPDATE public.online_rating_provider_budget SET enabled=true,operator_hold=false WHERE provider='lichess';
SET LOCAL ROLE service_role;
DO $$
DECLARE t uuid:='00000000-0000-0000-0000-000000000001';
 student uuid; ep text; v jsonb; j uuid; rowid uuid; winner uuid;
 at_time timestamptz:=clock_timestamp();
BEGIN
 IF public.ccp_online_rating_enqueue_due('lichess',9)->>'status' IS DISTINCT FROM 'invalid'
 THEN RAISE EXCEPTION 'schedule limit mismatch'; END IF;
 FOR n IN 1..5 LOOP
  student:=('ad370000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  SELECT online_rating_binding_epoch::text INTO ep FROM public.students WHERE id=student;
  v:=public.ccp_online_rating_consent_apply(t,student,'lichess','SyntheticA'||n,ep,0,true,gen_random_uuid());
  j:=(v->>'jobId')::uuid;
  IF j IS NULL THEN RAISE EXCEPTION 'consent seed failed'; END IF;
  -- Oldest due (1), less old due (2), recent (3), pending (4), revoked (5).
  UPDATE public.student_rating_sync_consents SET consented_at=at_time-interval '10 days' WHERE student_id=student;
  UPDATE public.student_rating_refresh_jobs
   SET created_at=at_time-interval '10 days', status=CASE WHEN n=4 THEN 'pending' ELSE 'succeeded' END,
       finished_at=CASE WHEN n=4 THEN NULL WHEN n=3 THEN at_time-interval '1 hour'
          ELSE at_time-make_interval(days=>6-n) END
   WHERE id=j;
  IF n=5 THEN
   v:=public.ccp_online_rating_consent_apply(t,student,'lichess','SyntheticA'||n,ep,1,false,gen_random_uuid());
   IF v->>'status' IS DISTINCT FROM 'revoked' THEN RAISE EXCEPTION 'revocation seed failed'; END IF;
  END IF;
 END LOOP;
 v:=public.ccp_online_rating_enqueue_due('lichess',1);
 IF (v->>'queued')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'first bounded enqueue %', v; END IF;
 SELECT id,student_id INTO rowid,winner FROM public.student_rating_refresh_jobs WHERE trigger_kind='scheduled';
 IF winner IS DISTINCT FROM 'ad370000-0000-4000-8000-000000000001'::uuid
  OR public.ccp_rating_refresh_claim(t,rowid) IS NULL
 THEN RAISE EXCEPTION 'first scheduled job is not the oldest eligible or cannot be claimed'; END IF;
 v:=public.ccp_online_rating_enqueue_due('lichess',3);
 IF (v->>'queued')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'second bounded enqueue %', v; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.student_rating_refresh_jobs
  WHERE trigger_kind='scheduled' AND student_id='ad370000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'second eligible identity missing'; END IF;
 IF (public.ccp_online_rating_enqueue_due('lichess',8)->>'queued')::int IS DISTINCT FROM 0
 OR (SELECT count(*) FROM public.student_rating_refresh_jobs WHERE trigger_kind='scheduled')<>2
 THEN RAISE EXCEPTION 'duplicate, skipped or catch-up work scheduled'; END IF;
END $$;
ROLLBACK;
SELECT 'Recurring queue synthetic bounds, order, current consent, claim and replay passed';
