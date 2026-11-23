-- Disposable only: exercises signed role semantics, reviewed pins and retained receipts.
BEGIN;
INSERT INTO public.workplaces(id,teacher_id,name,timezone) VALUES
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce85','00000000-0000-0000-0000-000000000001','Spreadsheet reviewed venue','Asia/Jerusalem'),
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce86','00000000-0000-0000-0000-000000000001','Second spreadsheet venue','UTC'),
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce8a','00000000-0000-0000-0000-000000000001','Future period venue','UTC');
INSERT INTO public.students(id,teacher_id,name,name_aliases) VALUES
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce87','00000000-0000-0000-0000-000000000001','Reviewed existing learner',ARRAY['Synthetic exact alias']),
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce8b','00000000-0000-0000-0000-000000000001','Reviewed existing learner',ARRAY['Another synthetic alias']);
INSERT INTO public.students(id,teacher_id,name,archived_at) VALUES
 ('218e3ed0-0c4c-4958-a7d0-54da7793ce88','00000000-0000-0000-0000-000000000001','Reviewed archived existing learner',clock_timestamp());
INSERT INTO public.teacher_spreadsheet_import_receipts(teacher_id,idempotency_key,request_hash,receipt)
VALUES('00000000-0000-0000-0000-000000000001','218e3ed0-0c4c-4958-a7d0-54da7793ce89',md5('[{"synthetic":"legacy proof"}]'::jsonb::text),'{"legacy":true}');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $proof$
DECLARE
 venue constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce85';
 other constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce86';
 future_venue constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce8a';
 existing constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce87';
 archived constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce88';
 legacy constant uuid:='218e3ed0-0c4c-4958-a7d0-54da7793ce89';
 raw jsonb;reviewed jsonb;proof jsonb;copy jsonb;receipt jsonb;key uuid:=gen_random_uuid();
 before_count integer; day_ date;
BEGIN
 IF public.ccp_teacher_spreadsheet_commit('[{"synthetic":"legacy proof"}]'::jsonb,legacy)<>'{"legacy":true}'::jsonb
 THEN RAISE EXCEPTION 'retained old receipt changed'; END IF;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_commit('[{"synthetic":"legacy proof"}]'::jsonb,gen_random_uuid());
  RAISE EXCEPTION 'unapproved old-array fresh write succeeded';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'IMPORT_REVIEW_REQUIRED' THEN RAISE; END IF;
 END;
 raw:=jsonb_build_array(
  jsonb_build_object('workplaceId',venue,'sourceWorkplaceName','Spreadsheet reviewed venue',
    'sourceRow',2,'studentName','Reviewed initial learner','archived',false),
  jsonb_build_object('workplaceId',other,'sourceRow',3,'studentName','SYNTHETIC   EXACT ALIAS',
    'archived',false,'studentId',existing),
  jsonb_build_object('workplaceId',other,'sourceRow',4,'studentName','Reviewed new archived learner','archived',true)
 );
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_build_array(raw->0,
  (raw->0)||jsonb_build_object('sourceRow',8,'studentName','ＲＥＶＩＥＷＥＤ   INITIAL LEARNER')));
 IF copy->'canCommit'<>'false' OR jsonb_array_length(copy->'issues')<>2
  OR copy#>>'{issues,0,code}'<>'DUPLICATE_IMPORT_IDENTITY' THEN
  RAISE EXCEPTION 'canonical direct duplicate was not blocked: %',copy; END IF;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_review(jsonb_build_array((raw->0)||'{"familyKey":"forged"}'::jsonb));
  RAISE EXCEPTION 'unreviewed client family group key accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'IMPORT_VALIDATION_ERROR' THEN RAISE; END IF;
 END;
 INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id,starts_on)
 VALUES(auth.uid(),future_venue,existing,(clock_timestamp() AT TIME ZONE 'UTC')::date+5);
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_set(raw,'{1}',((raw->1)-'workplaceId')||jsonb_build_object('workplaceIds',ARRAY[other,future_venue])));
 IF copy->'canCommit'<>'false' OR copy#>>'{issues,0,code}'<>'IMPORT_FUTURE_ENROLLMENT_CONFLICT' THEN
  RAISE EXCEPTION 'missing future enrollment conflict: %',copy; END IF;
 SELECT count(*) INTO before_count FROM public.students
 WHERE name IN ('Reviewed initial learner','Reviewed new archived learner');
 reviewed:=public.ccp_teacher_spreadsheet_review(raw);
 IF reviewed->'writesPerformed'<>'false' OR reviewed->'canCommit'<>'true'
  OR reviewed#>>'{identities,2,mode}'<>'createArchived'
  OR reviewed#>>'{identities,2,enrollmentRequested}'<>'false'
  OR (SELECT count(*) FROM public.students WHERE name IN ('Reviewed initial learner','Reviewed new archived learner'))<>before_count
 THEN RAISE EXCEPTION 'no-write/archived initial preview failed: %',reviewed; END IF;
 proof:=reviewed->'envelope'||'{"confirmed":true}'::jsonb;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_commit(jsonb_set(proof,'{calendar,day}','"2001-01-01"'),gen_random_uuid());
  RAISE EXCEPTION 'stale review day committed';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'IMPORT_PREVIEW_CHANGED' THEN RAISE; END IF;
 END;
 -- Rename after approval: transaction refuses the complete mixed batch.
 UPDATE public.workplaces SET name='Renamed review venue' WHERE id=venue;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_commit(proof,key);
  RAISE EXCEPTION 'venue revision change committed';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'IMPORT_PREVIEW_CHANGED' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.students WHERE name IN ('Reviewed initial learner','Reviewed new archived learner'))<>before_count
 THEN RAISE EXCEPTION 'stale batch partially committed'; END IF;
 raw:=jsonb_set(raw,'{0,sourceWorkplaceName}','"Renamed review venue"');
 reviewed:=public.ccp_teacher_spreadsheet_review(raw);
 proof:=reviewed->'envelope'||'{"confirmed":true}'::jsonb;
 day_:=(reviewed#>>'{calendar,day}')::date;
 receipt:=public.ccp_teacher_spreadsheet_commit(proof,key);
 IF (receipt->>'studentsCreated')::int<>2 OR (receipt->>'enrollmentsCreated')::int<>2 OR
  (SELECT count(*) FROM public.workplace_enrollments e JOIN public.students s ON s.id=e.student_id
   WHERE (e.workplace_id=venue AND s.name='Reviewed initial learner' OR e.workplace_id=other AND s.id=existing)
   AND e.starts_on=day_ AND e.cancelled_at IS NULL)<>2 OR
  EXISTS(SELECT 1 FROM public.workplace_enrollments e JOIN public.students s ON s.id=e.student_id
    WHERE s.name='Reviewed new archived learner') OR
  NOT EXISTS(SELECT 1 FROM public.students WHERE name='Reviewed new archived learner' AND archived_at IS NOT NULL)
 THEN RAISE EXCEPTION 'mixed commit evidence mismatch: %',receipt;END IF;
 PERFORM public.ccp_workplace_enrollment_end_commit(venue,e.student_id,e.revision,gen_random_uuid(),
  'Synthetic controlled workplace retirement',true)
 FROM public.workplace_enrollments e WHERE e.workplace_id=venue AND e.cancelled_at IS NULL;
 UPDATE public.workplaces SET archived_at=clock_timestamp() WHERE id=venue;
 IF public.ccp_teacher_spreadsheet_commit(proof,key)<>receipt THEN
  RAISE EXCEPTION 'exact admitted receipt did not replay after retirement';
 END IF;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_commit(proof,gen_random_uuid());
  RAISE EXCEPTION 'fresh stale archived venue write succeeded';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'IMPORT_PREVIEW_CHANGED' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ccp_teacher_spreadsheet_commit(jsonb_set(proof,'{rows,0,studentName}','"Changed approved learner"'),key);
  RAISE EXCEPTION 'changed receipt payload succeeded';
 EXCEPTION WHEN unique_violation THEN
  IF SQLERRM<>'IMPORT_REPLAY_CONFLICT' THEN RAISE; END IF;
 END;
 raw:=jsonb_build_array(jsonb_build_object('workplaceIds',ARRAY[future_venue,other],
  'sourceRow',2,'studentName','One physical profile with two current venues','archived',false));
 reviewed:=public.ccp_teacher_spreadsheet_review(raw);
 IF reviewed->'canCommit'<>'true' OR jsonb_array_length(reviewed->'workplaceTargets')<>2 THEN
  RAISE EXCEPTION 'multi-site review mismatch: %',reviewed; END IF;
 proof:=reviewed->'envelope'||'{"confirmed":true}'::jsonb;
 receipt:=public.ccp_teacher_spreadsheet_commit(proof,gen_random_uuid());
 IF (receipt->>'studentsCreated')::int<>1 OR (receipt->>'enrollmentsCreated')::int<>2 OR
   (SELECT count(DISTINCT e.student_id) FROM public.workplace_enrollments e JOIN public.students s ON s.id=e.student_id
     WHERE s.name='One physical profile with two current venues' AND e.workplace_id=ANY(ARRAY[future_venue,other]))<>1
 THEN RAISE EXCEPTION 'multi-site write created duplicate profile or incomplete memberships: %',receipt;END IF;
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_set(raw,'{0,workplaceIds}',to_jsonb(ARRAY[other,other])));
 IF copy#>>'{issues,0,code}'<>'WORKPLACE_TARGET_DUPLICATE' THEN
  RAISE EXCEPTION 'duplicate direct target IDs not blocked: %',copy;END IF;
 raw:=jsonb_build_array(
  jsonb_build_object('studentName','Reviewed existing learner','workplaceId',other,'sourceRow',5,
    'studentId',existing,'archived',false),
  jsonb_build_object('studentName','Reviewed existing learner','workplaceId',other,'sourceRow',6,
    'studentId','218e3ed0-0c4c-4958-a7d0-54da7793ce8b','archived',false));
 reviewed:=public.ccp_teacher_spreadsheet_review(raw);
 IF reviewed->'canCommit'<>'true' THEN RAISE EXCEPTION 'distinct explicitly selected homonyms rejected: %',reviewed;END IF;
 receipt:=public.ccp_teacher_spreadsheet_commit(reviewed->'envelope'||'{"confirmed":true}'::jsonb,gen_random_uuid());
 IF (receipt->>'studentsCreated')::int<>0 OR (receipt->>'studentsSkipped')::int<>2 OR (receipt->>'enrollmentsCreated')::int<>1
 THEN RAISE EXCEPTION 'homonym receipt did not preserve prior membership/create only missing: %',receipt;END IF;
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_set(raw,'{1,studentId}',to_jsonb(existing)));
 IF copy->'canCommit'<>'false' OR copy#>>'{issues,0,code}'<>'DUPLICATE_IMPORT_IDENTITY' THEN
  RAISE EXCEPTION 'duplicate exact selected identity was accepted: %',copy;END IF;
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_build_array(jsonb_build_object('workplaceId',other,
  'sourceRow',2,'studentName','Reviewed archived existing learner','archived',false,'studentId',archived)));
 IF copy->'canCommit'<>'false' OR copy#>>'{issues,0,code}'<>'ARCHIVED_IMPORT_IDENTITY' THEN
  RAISE EXCEPTION 'archived existing review did not clearly block: %',copy;END IF;
 copy:=public.ccp_teacher_spreadsheet_review(jsonb_build_array(jsonb_build_object('workplaceId',other,
  'sourceRow',2,'studentName','Arbitrary alternate spelling','archived',false,'studentId',existing)));
 IF copy->'canCommit'<>'false' OR copy#>>'{issues,0,code}'<>'IMPORT_IDENTITY_NOT_AVAILABLE' THEN
  RAISE EXCEPTION 'arbitrary spelling was eligible to retarget: %',copy;END IF;
END;
$proof$;
RESET ROLE;
ROLLBACK;
