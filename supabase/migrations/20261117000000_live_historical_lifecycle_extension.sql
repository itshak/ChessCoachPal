-- Forward-only, non-destructive repair for databases installed before the
-- historical-attendance/lifecycle extensions were appended to the canonical
-- fresh-install baseline. Existing migrations ledger must NOT be reset.
-- Re-runnable on both earlier deployments and fresh baseline installations.
-- Only adds missing objects and refreshes function bodies; student rows remain.

-- Atomic reviewed student lifecycle batch. This is the one current-schema
-- definition; existing live databases require a separate non-destructive
-- operator-approved schema application, never a reset.
CREATE OR REPLACE FUNCTION public.ccp_student_bulk_lifecycle(
 p_rows jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $bulk_lifecycle$
DECLARE
 v_teacher uuid:=auth.uid();
 v_hash text;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_row jsonb;
 v_student public.students%ROWTYPE;
 v_id uuid;
 v_revision timestamptz;
 v_archive boolean;
 v_seen uuid[]:=ARRAY[]::uuid[];
 v_result jsonb:='[]'::jsonb;
 v_updated public.students%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
    OR pg_column_size(p_rows)>45000 THEN
  RAISE EXCEPTION 'BULK_LIFECYCLE_INVALID' USING ERRCODE='22023';
 END IF;
 -- Serialize quota changes and concurrent archive operations for a coach.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 v_hash:=md5(jsonb_build_array('student.bulk.lifecycle',p_rows)::text);
 INSERT INTO public.agent_tool_receipts
   (teacher_id,idempotency_key,operation,request_hash,receipt)
 VALUES(v_teacher,p_request_id,'student.bulk.lifecycle',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF NOT FOUND OR v_saved.operation<>'student.bulk.lifecycle'
     OR v_saved.request_hash<>v_hash THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_REPLAY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 -- Lock all target rows and validate everything before the first status
 -- update. Every user-facing preview rule is independently rechecked here.
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
    ORDER BY value->>'studentId' LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
     OR (v_row - ARRAY['studentId','archived','expectedUpdatedAt'])<>'{}'::jsonb
     OR jsonb_typeof(v_row->'studentId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_row->'archived') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v_row->'expectedUpdatedAt') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_INVALID' USING ERRCODE='22023';
  END IF;
  v_id:=(v_row->>'studentId')::uuid;
  v_archive:=(v_row->>'archived')::boolean;
  v_revision:=(v_row->>'expectedUpdatedAt')::timestamptz;
  IF v_id=ANY(v_seen) THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_DUPLICATE' USING ERRCODE='22023';
  END IF;
  v_seen:=array_append(v_seen,v_id);
  SELECT * INTO v_student FROM public.students
   WHERE teacher_id=v_teacher AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF v_student.updated_at IS DISTINCT FROM v_revision THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_REVISION' USING ERRCODE='23505';
  END IF;
  IF v_archive AND v_student.archived_at IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.workplace_enrollments
      WHERE teacher_id=v_teacher AND student_id=v_id) THEN
    RAISE EXCEPTION 'ACTIVE_WORKPLACE' USING ERRCODE='23503';
   END IF;
   IF EXISTS(SELECT 1 FROM public.group_enrollments
      WHERE teacher_id=v_teacher AND student_id=v_id)
    OR EXISTS(SELECT 1 FROM public.lesson_slots
      WHERE teacher_id=v_teacher AND student_id=v_id AND active)
    OR EXISTS(SELECT 1 FROM public.teaching_sessions
      WHERE teacher_id=v_teacher AND student_id=v_id AND status='scheduled'
        AND starts_at>=clock_timestamp())
    OR EXISTS(SELECT 1 FROM public.session_participants sp
      JOIN public.teaching_sessions sess ON sess.id=sp.session_id
      WHERE sp.teacher_id=v_teacher AND sp.student_id=v_id
        AND sess.status='scheduled' AND sess.starts_at>=clock_timestamp()) THEN
    RAISE EXCEPTION 'FUTURE_COMMITMENTS' USING ERRCODE='23503';
   END IF;
  END IF;
 END LOOP;
 -- Archive first, then activate. That allows exchanging one inactive slot at
 -- the hosted quota with another without transient capacity overage.
 FOR v_archive IN SELECT flag FROM (VALUES (true),(false)) AS actions(flag) LOOP
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
       WHERE (value->>'archived')::boolean=v_archive
       ORDER BY value->>'studentId' LOOP
   v_id:=(v_row->>'studentId')::uuid;
   UPDATE public.students SET archived_at=CASE WHEN v_archive
       THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END
    WHERE teacher_id=v_teacher AND id=v_id
      AND archived_at IS DISTINCT FROM
        CASE WHEN v_archive THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END
    RETURNING * INTO v_updated;
   IF NOT FOUND THEN
     SELECT * INTO v_updated FROM public.students WHERE id=v_id AND teacher_id=v_teacher;
   END IF;
   v_result:=v_result||jsonb_build_array(jsonb_build_object(
     'studentId',v_id,'archived',v_updated.archived_at IS NOT NULL,
     'updatedAt',v_updated.updated_at));
  END LOOP;
 END LOOP;
 UPDATE public.agent_tool_receipts SET receipt=jsonb_build_object(
   'students',v_result,'count',jsonb_array_length(v_result),
   'idempotencyKey',p_request_id)
 WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN jsonb_build_object('students',v_result,'count',jsonb_array_length(v_result),
   'idempotencyKey',p_request_id,'replayed',false);
END;
$bulk_lifecycle$;
REVOKE ALL ON FUNCTION public.ccp_student_bulk_lifecycle(jsonb,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_bulk_lifecycle(jsonb,uuid)
 TO authenticated;

-- Read-only owner-bound receipt lookup for identical cross-client retries.
-- A replay must not be rejected by the preview because the original request
-- already changed those revisions, and a changed payload must never replay.
CREATE OR REPLACE FUNCTION public.ccp_student_bulk_lifecycle_replay(
 p_rows jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $bulk_replay$
DECLARE
 v_teacher uuid:=auth.uid();
 v_saved public.agent_tool_receipts%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_rows)<>'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100
    OR pg_column_size(p_rows)>45000 THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_saved FROM public.agent_tool_receipts
  WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_saved.operation<>'student.bulk.lifecycle'
   OR v_saved.request_hash<>md5(jsonb_build_array('student.bulk.lifecycle',p_rows)::text) THEN
   RAISE EXCEPTION 'BULK_LIFECYCLE_REPLAY_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN v_saved.receipt||jsonb_build_object('replayed',true);
END;
$bulk_replay$;
REVOKE ALL ON FUNCTION public.ccp_student_bulk_lifecycle_replay(jsonb,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_bulk_lifecycle_replay(jsonb,uuid)
 TO authenticated;

-- Historical attendance is provenance-labelled evidence, NEVER a fabricated
-- teaching_sessions/session_attendance row. Real dated observations and
-- aggregate-only legacy counts are permanently distinguishable.
CREATE TABLE IF NOT EXISTS public.ccp_historical_attendance_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 workplace_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('dated','aggregate')),
 attended_on date,
 period_start date,
 period_end date,
 attendance_status text NOT NULL CHECK(attendance_status IN ('present','late','absent','excused')),
 lesson_count integer NOT NULL CHECK(lesson_count BETWEEN 1 AND 1000),
 source_row integer NOT NULL CHECK(source_row BETWEEN 2 AND 1000000),
 source_label text NOT NULL DEFAULT '' CHECK(length(source_label)<=256),
 source_timezone text NOT NULL CHECK(length(source_timezone) BETWEEN 1 AND 100),
 school_year_start date NOT NULL,
 school_year_end date NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 batch_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ccp_historical_year_range CHECK(school_year_start<=school_year_end),
 CONSTRAINT ccp_historical_mode_fields CHECK(
  (mode='dated' AND attended_on IS NOT NULL
   AND attended_on BETWEEN school_year_start AND school_year_end
   AND period_start IS NULL AND period_end IS NULL AND lesson_count=1)
  OR
  (mode='aggregate' AND attended_on IS NULL
   AND period_start IS NOT NULL AND period_end IS NOT NULL
   AND period_start<=period_end
   AND period_start>=school_year_start AND period_end<=school_year_end)
 ),
 CONSTRAINT ccp_historical_teacher_student FOREIGN KEY(student_id,teacher_id)
   REFERENCES public.students(id,teacher_id) ON DELETE RESTRICT,
 CONSTRAINT ccp_historical_teacher_workplace FOREIGN KEY(workplace_id,teacher_id)
   REFERENCES public.workplaces(id,teacher_id) ON DELETE RESTRICT,
 CONSTRAINT ccp_historical_batch_row UNIQUE(teacher_id,batch_id,source_row)
);
CREATE INDEX IF NOT EXISTS ccp_historical_teacher_student_date ON public.ccp_historical_attendance_evidence
 (teacher_id,student_id,attended_on,period_start,created_at DESC);
CREATE INDEX IF NOT EXISTS ccp_historical_teacher_workplace ON public.ccp_historical_attendance_evidence
 (teacher_id,workplace_id,school_year_start);
ALTER TABLE public.ccp_historical_attendance_evidence ENABLE ROW LEVEL SECURITY;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ccp_historical_attendance_evidence' AND policyname='ccp_historical_evidence_owner_read') THEN
    CREATE POLICY ccp_historical_evidence_owner_read ON public.ccp_historical_attendance_evidence FOR SELECT TO authenticated
 USING (teacher_id=(select auth.uid()));
  END IF;
END $ccp_policy$;
REVOKE ALL ON public.ccp_historical_attendance_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ccp_historical_attendance_evidence TO authenticated;
GRANT ALL ON public.ccp_historical_attendance_evidence TO service_role;

-- Short-lived staging is only a pointer to private Storage bytes; it does not
-- embed child PII, provider secrets or file content in MCP tool arguments.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('ccp-historical-imports','ccp-historical-imports',false,8388608,
 ARRAY['text/csv','text/tab-separated-values',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.ms-excel','text/plain'])
ON CONFLICT(id) DO UPDATE SET
 public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ccp_historical_storage_read') THEN
    CREATE POLICY ccp_historical_storage_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='ccp-historical-imports'
  AND (storage.foldername(name))[1]=(select auth.uid())::text);
  END IF;
END $ccp_policy$;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ccp_historical_storage_insert') THEN
    CREATE POLICY ccp_historical_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='ccp-historical-imports'
  AND (storage.foldername(name))[1]=(select auth.uid())::text);
  END IF;
END $ccp_policy$;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ccp_historical_storage_delete') THEN
    CREATE POLICY ccp_historical_storage_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='ccp-historical-imports'
  AND (storage.foldername(name))[1]=(select auth.uid())::text);
  END IF;
END $ccp_policy$;

CREATE TABLE IF NOT EXISTS public.ccp_historical_import_stages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 150),
 storage_path text NOT NULL UNIQUE,
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 8388608),
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT(now()+interval '2 hours'),
 CONSTRAINT ccp_historical_stage_ttl CHECK(
  expires_at>created_at AND expires_at<=created_at+interval '2 hours')
);
CREATE INDEX IF NOT EXISTS ccp_historical_import_stage_owner ON public.ccp_historical_import_stages
 (teacher_id,expires_at DESC);
ALTER TABLE public.ccp_historical_import_stages ENABLE ROW LEVEL SECURITY;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ccp_historical_import_stages' AND policyname='ccp_historical_stage_owner_select') THEN
    CREATE POLICY ccp_historical_stage_owner_select ON public.ccp_historical_import_stages
 FOR SELECT TO authenticated USING(teacher_id=(select auth.uid()));
  END IF;
END $ccp_policy$;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ccp_historical_import_stages' AND policyname='ccp_historical_stage_owner_insert') THEN
    CREATE POLICY ccp_historical_stage_owner_insert ON public.ccp_historical_import_stages
 FOR INSERT TO authenticated
 WITH CHECK(teacher_id=(select auth.uid())
  AND storage_path LIKE (select auth.uid())::text||'/%');
  END IF;
END $ccp_policy$;
DO $ccp_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ccp_historical_import_stages' AND policyname='ccp_historical_stage_owner_delete') THEN
    CREATE POLICY ccp_historical_stage_owner_delete ON public.ccp_historical_import_stages
 FOR DELETE TO authenticated USING(teacher_id=(select auth.uid()));
  END IF;
END $ccp_policy$;
REVOKE ALL ON public.ccp_historical_import_stages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.ccp_historical_import_stages TO authenticated;
GRANT ALL ON public.ccp_historical_import_stages TO service_role;

CREATE OR REPLACE FUNCTION public.ccp_historical_attendance_commit(
 p_rows jsonb,p_school_year_start date,p_school_year_end date,
 p_timezone text,p_source_sha256 text,p_preview_digest text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $historical_commit$
DECLARE
 v_teacher uuid:=auth.uid();
 v_hash text;
 v_saved public.agent_tool_receipts%ROWTYPE;
 v_row jsonb;
 v_id uuid;
 v_student uuid;
 v_workplace uuid;
 v_source_row integer;
 v_mode text;
 v_attendance text;
 v_date date;
 v_start date;
 v_end date;
 v_count integer;
 v_seen_rows integer[]:=ARRAY[]::integer[];
 v_key text;
 v_seen_keys text[]:=ARRAY[]::text[];
 v_created integer:=0;
 v_result jsonb;
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_school_year_start IS NULL
    OR p_school_year_end IS NULL OR p_school_year_end<p_school_year_start
    OR p_school_year_end>p_school_year_start+interval '10 years'
    OR p_timezone IS NULL OR length(p_timezone) NOT BETWEEN 1 AND 100
    OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
    OR p_preview_digest IS NULL OR p_preview_digest !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 2000
    OR pg_column_size(p_rows)>1000000 THEN
  RAISE EXCEPTION 'HISTORICAL_IMPORT_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 v_hash:=md5(jsonb_build_array('historical.attendance',p_rows,p_school_year_start,
  p_school_year_end,p_timezone,p_source_sha256,p_preview_digest)::text);
 INSERT INTO public.agent_tool_receipts(
  teacher_id,idempotency_key,operation,request_hash,receipt)
 VALUES(v_teacher,p_request_id,'historical.attendance',v_hash,'{}'::jsonb)
 ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN
  SELECT * INTO v_saved FROM public.agent_tool_receipts
   WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
  IF NOT FOUND OR v_saved.operation<>'historical.attendance'
     OR v_saved.request_hash<>v_hash THEN
    RAISE EXCEPTION 'HISTORICAL_REPLAY_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN v_saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(v_row) IS DISTINCT FROM 'object'
     OR (v_row - ARRAY['sourceRow','studentId','workplaceId','mode',
       'attendedOn','periodStart','periodEnd','attendanceStatus',
       'lessonCount','sourceLabel','sourceTimezone']) <> '{}'::jsonb
     OR jsonb_typeof(v_row->'studentId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_row->'workplaceId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_row->'sourceRow') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_row->'mode') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_row->'attendanceStatus') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_row->'lessonCount') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_row->'sourceLabel') IS DISTINCT FROM 'string'
     OR length(v_row->>'sourceLabel')>256 THEN
   RAISE EXCEPTION 'HISTORICAL_IMPORT_INVALID' USING ERRCODE='22023';
  END IF;
  v_student:=(v_row->>'studentId')::uuid;
  v_workplace:=(v_row->>'workplaceId')::uuid;
  v_source_row:=(v_row->>'sourceRow')::integer;
  v_mode:=v_row->>'mode';
  v_attendance:=v_row->>'attendanceStatus';
  v_count:=(v_row->>'lessonCount')::integer;
  v_date:=(v_row->>'attendedOn')::date;
  v_start:=(v_row->>'periodStart')::date;
  v_end:=(v_row->>'periodEnd')::date;
  IF v_source_row NOT BETWEEN 2 AND 1000000 OR v_source_row=ANY(v_seen_rows)
     OR v_mode NOT IN ('dated','aggregate')
     OR v_attendance NOT IN ('present','late','absent','excused')
     OR v_count NOT BETWEEN 1 AND 1000
     OR (v_mode='dated' AND (v_date IS NULL OR v_count<>1 OR
         v_start IS NOT NULL OR v_end IS NOT NULL
         OR v_date NOT BETWEEN p_school_year_start AND p_school_year_end))
     OR (v_mode='aggregate' AND (v_date IS NOT NULL OR
         v_start IS NULL OR v_end IS NULL OR v_start>v_end OR
         v_start<p_school_year_start OR v_end>p_school_year_end)) THEN
   RAISE EXCEPTION 'HISTORICAL_IMPORT_INVALID' USING ERRCODE='22023';
  END IF;
  v_seen_rows:=array_append(v_seen_rows,v_source_row);
  -- No guessing foreign or nonexistent identities. Historical evidence does
  -- not require current workplace enrollment, which may have ended years ago.
  IF NOT EXISTS(SELECT 1 FROM public.students
     WHERE teacher_id=v_teacher AND id=v_student)
    OR NOT EXISTS(SELECT 1 FROM public.workplaces
     WHERE teacher_id=v_teacher AND id=v_workplace) THEN
   RAISE EXCEPTION 'HISTORICAL_IMPORT_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  -- With no time of day, a second dated status for the same pupil/day/venue
  -- cannot be distinguished from a duplicate. Refuse rather than fabricate.
  v_key:=v_student::text||':'||v_workplace::text||':'||v_mode||':'||
    coalesce(v_date::text,v_start::text||':'||v_end::text)||':'||v_attendance;
  IF v_key=ANY(v_seen_keys) OR EXISTS(
    SELECT 1 FROM public.ccp_historical_attendance_evidence
     WHERE teacher_id=v_teacher AND student_id=v_student
       AND workplace_id=v_workplace AND mode=v_mode
       AND attendance_status=v_attendance
       AND attended_on IS NOT DISTINCT FROM v_date
       AND period_start IS NOT DISTINCT FROM v_start
       AND period_end IS NOT DISTINCT FROM v_end
  ) THEN
   RAISE EXCEPTION 'HISTORICAL_IMPORT_DUPLICATE' USING ERRCODE='23505';
  END IF;
  v_seen_keys:=array_append(v_seen_keys,v_key);
  INSERT INTO public.ccp_historical_attendance_evidence(
   teacher_id,student_id,workplace_id,mode,attended_on,period_start,period_end,
   attendance_status,lesson_count,source_row,source_label,source_timezone,
   school_year_start,school_year_end,source_sha256,batch_id
  ) VALUES(v_teacher,v_student,v_workplace,v_mode,v_date,v_start,v_end,
   v_attendance,v_count,v_source_row,v_row->>'sourceLabel',
   coalesce(nullif(v_row->>'sourceTimezone',''),p_timezone),
   p_school_year_start,p_school_year_end,p_source_sha256,p_request_id);
  v_created:=v_created+1;
 END LOOP;
 v_result:=jsonb_build_object(
  'count',v_created,'idempotencyKey',p_request_id,'sourceSha256',p_source_sha256);
 UPDATE public.agent_tool_receipts SET receipt=v_result
  WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 RETURN v_result||jsonb_build_object('replayed',false);
END;
$historical_commit$;
REVOKE ALL ON FUNCTION public.ccp_historical_attendance_commit(
 jsonb,date,date,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_historical_attendance_commit(
 jsonb,date,date,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_historical_attendance_replay(
 p_rows jsonb,p_school_year_start date,p_school_year_end date,
 p_timezone text,p_source_sha256 text,p_preview_digest text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $historical_replay$
DECLARE
 v_teacher uuid:=auth.uid();
 v_saved public.agent_tool_receipts%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN
  RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_saved FROM public.agent_tool_receipts
  WHERE teacher_id=v_teacher AND idempotency_key=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_saved.operation<>'historical.attendance'
   OR v_saved.request_hash<>md5(jsonb_build_array('historical.attendance',
     p_rows,p_school_year_start,p_school_year_end,p_timezone,
     p_source_sha256,p_preview_digest)::text) THEN
   RAISE EXCEPTION 'HISTORICAL_REPLAY_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN v_saved.receipt||jsonb_build_object('replayed',true);
END;
$historical_replay$;
REVOKE ALL ON FUNCTION public.ccp_historical_attendance_replay(
 jsonb,date,date,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_historical_attendance_replay(
 jsonb,date,date,text,text,text,uuid) TO authenticated;

-- Source-precise historical report: aggregate counts are NEVER silently
-- added to calendar session counts; output labels are separate by precision.
CREATE OR REPLACE FUNCTION public.ccp_historical_attendance_summary(
 p_student_id uuid DEFAULT NULL,p_workplace_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $historical_summary$
DECLARE
 v_teacher uuid:=auth.uid();
 v_dated bigint;
 v_aggregates bigint;
 v_declared bigint;
 v_workplaces bigint;
 v_earliest date;
 v_latest date;
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
 END IF;
 IF (p_student_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.students WHERE id=p_student_id AND teacher_id=v_teacher))
  OR (p_workplace_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.workplaces WHERE id=p_workplace_id AND teacher_id=v_teacher)) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 SELECT
  count(*) FILTER(WHERE mode='dated'),
  count(*) FILTER(WHERE mode='aggregate'),
  coalesce(sum(lesson_count) FILTER(WHERE mode='aggregate'),0),
  count(DISTINCT workplace_id),
  min(coalesce(attended_on,period_start)),
  max(coalesce(attended_on,period_end))
 INTO v_dated,v_aggregates,v_declared,v_workplaces,v_earliest,v_latest
 FROM public.ccp_historical_attendance_evidence
 WHERE teacher_id=v_teacher
  AND (p_student_id IS NULL OR student_id=p_student_id)
  AND (p_workplace_id IS NULL OR workplace_id=p_workplace_id);
 RETURN jsonb_build_object(
   'datedObservations',v_dated,'aggregateSourceRows',v_aggregates,
   'aggregateDeclaredLessons',v_declared,'workplacesRepresented',v_workplaces,
   'earliestSourceDate',v_earliest,'latestSourceDate',v_latest,
   'notCalendarSessions',true,'studentId',p_student_id,
   'workplaceId',p_workplace_id);
END;
$historical_summary$;
REVOKE ALL ON FUNCTION public.ccp_historical_attendance_summary(uuid,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_historical_attendance_summary(uuid,uuid)
 TO authenticated;

NOTIFY pgrst, 'reload schema';
