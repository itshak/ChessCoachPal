\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE f text:='public.ccp_online_rating_consent_apply(uuid,uuid,text,text,text,bigint,boolean,uuid)';
BEGIN
 IF current_setting('ccp.rating_synthetic',true) IS DISTINCT FROM 'disposable'
 OR has_function_privilege('anon',f,'EXECUTE')
 OR has_function_privilege('authenticated',f,'EXECUTE')
 OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN
  RAISE EXCEPTION 'Fixture marker or consent ACL mismatch';
 END IF;
END $$;
INSERT INTO public.students(id,teacher_id,name,lichess_username,chesscom_username) VALUES
('ad360000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000001',
 'Synthetic consent change','SyntheticA','SyntheticB');
SET LOCAL ROLE service_role;
DO $$
DECLARE t uuid:='00000000-0000-0000-0000-000000000001'; s uuid:='ad360000-0000-4000-8000-000000000004';
 other uuid:='00000000-0000-0000-0000-000000000002';
 k uuid:=gen_random_uuid(); revoke_key uuid:=gen_random_uuid(); refresh_key uuid:=gen_random_uuid();
 ep text; recorded jsonb; replay jsonb; v jsonb; old_job uuid; fresh_job uuid; consent_rev bigint;
BEGIN
 SELECT online_rating_binding_epoch::text INTO ep FROM public.students WHERE id=s;
 IF public.ccp_online_rating_consent_apply(other,s,'lichess','SyntheticA',ep,0,true,k) IS NOT NULL OR
    public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticWrong',ep,0,true,k)
      IS DISTINCT FROM '{"status":"stale"}'::jsonb OR
    EXISTS(SELECT 1 FROM public.student_rating_sync_consents WHERE student_id=s)
 THEN RAISE EXCEPTION 'Unauthorized or stale initial action wrote state'; END IF;
 recorded:=public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,0,true,k);
 old_job:=(recorded->>'jobId')::uuid;
 IF old_job IS NULL OR recorded->>'status'<>'accepted' OR (recorded->>'replayed')::boolean THEN
  RAISE EXCEPTION 'Fresh consent did not return job'; END IF;
 replay:=public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,0,true,k);
 IF replay IS DISTINCT FROM recorded || '{"replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'Safe opt-in replay did not return the original job'; END IF;
 BEGIN
  PERFORM public.ccp_online_rating_consent_apply(t,s,'chesscom','SyntheticB',ep,0,true,k);
  RAISE EXCEPTION 'Changed inputs reused opt-in key';
 EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'RATING_CONSENT_REQUEST_CONFLICT' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.student_rating_refresh_jobs j
 JOIN public.student_rating_sync_consents c ON c.id=j.consent_id
 WHERE j.student_id=s AND j.provider='lichess' AND j.id=old_job AND c.enabled AND
  j.created_at>=c.consented_at AND j.handle_revision=c.handle_revision AND j.source_username=c.source_username)<>1 THEN
  RAISE EXCEPTION 'First job did not match consent and ordering'; END IF;
 v:=public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,1,false,revoke_key);
 IF v IS DISTINCT FROM '{"status":"revoked","replayed":false}'::jsonb OR
    public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,1,false,revoke_key)
      IS DISTINCT FROM '{"status":"revoked","replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'Revocation idempotency failed'; END IF;
 replay:=public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,0,true,k);
 IF replay IS DISTINCT FROM recorded || '{"replayed":true}'::jsonb OR
    EXISTS(SELECT 1 FROM public.student_rating_sync_consents WHERE student_id=s AND enabled) OR
    public.ccp_rating_refresh_claim(t,old_job) IS NOT NULL THEN
  RAISE EXCEPTION 'Historical opt-in replay restored permission'; END IF;
 SELECT revision INTO consent_rev FROM public.student_rating_sync_consents WHERE student_id=s AND provider='lichess';
 v:=public.ccp_online_rating_consent_apply(t,s,'lichess','SyntheticA',ep,consent_rev,true,refresh_key);
 fresh_job:=(v->>'jobId')::uuid;
 IF fresh_job IS NULL OR fresh_job=old_job OR
    (SELECT count(*) FROM public.student_rating_refresh_jobs WHERE student_id=s)<>2 OR
    public.ccp_rating_refresh_claim(t,fresh_job) IS NULL THEN
  RAISE EXCEPTION 'Fresh reapproval did not create only one new eligible job'; END IF;
END $$;
ROLLBACK;
