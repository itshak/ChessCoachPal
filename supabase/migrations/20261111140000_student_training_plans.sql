-- Canonical teacher-authored training plans and explicit student goal outcomes.
-- No AI/assignment automation may mark a chess goal achieved; coach evidence is
-- required. Append-only revisions retain historical edits and manual overrides.
CREATE TABLE public.student_training_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 student_id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 160),
 summary text NOT NULL DEFAULT '' CHECK(char_length(summary)<=2500),
 status text NOT NULL CHECK(status IN ('draft','active','paused','completed','archived')),
 goals jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(goals)='array' AND jsonb_array_length(goals)<=20),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(teacher_id,id),
 FOREIGN KEY(student_id,teacher_id) REFERENCES public.students(id,teacher_id)
   ON DELETE RESTRICT
);
CREATE INDEX student_training_plans_list
 ON public.student_training_plans(teacher_id,student_id,updated_at DESC,id);
ALTER TABLE public.student_training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plans ON public.student_training_plans
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plans TO authenticated;

CREATE TABLE public.student_training_plan_revisions(
 teacher_id uuid NOT NULL,
 plan_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>=1),
 snapshot jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,plan_id,revision),
 FOREIGN KEY(teacher_id,plan_id)
  REFERENCES public.student_training_plans(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.student_training_plan_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plan_revisions ON public.student_training_plan_revisions
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plan_revisions TO authenticated;

CREATE TABLE public.student_training_plan_receipts(
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 request_hash text NOT NULL,
 plan_id uuid NOT NULL,
 revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id),
 FOREIGN KEY(teacher_id,plan_id)
  REFERENCES public.student_training_plans(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.student_training_plan_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_training_plan_receipts ON public.student_training_plan_receipts
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.student_training_plan_receipts TO authenticated;

CREATE FUNCTION public.ccp_student_training_plan_commit(
 p_plan_id uuid,p_expected_revision bigint,p_student_id uuid,p_title text,
 p_summary text,p_status text,p_goals jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $commit$
DECLARE
 v_teacher uuid:=auth.uid();
 v_student_archived timestamptz;
 v_existing public.student_training_plans%ROWTYPE;
 v_receipt public.student_training_plan_receipts%ROWTYPE;
 v_goal jsonb;
 v_key text;
 v_hash text;
 v_id uuid;
 v_revision bigint;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_request_id IS NULL OR p_student_id IS NULL OR
    (p_plan_id IS NULL AND p_expected_revision IS NOT NULL) OR
    (p_plan_id IS NOT NULL AND (p_expected_revision IS NULL OR p_expected_revision<1)) OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_summary,''))>2500 OR
    p_status IS NULL OR p_status NOT IN ('draft','active','paused','completed','archived') OR
    p_goals IS NULL OR jsonb_typeof(p_goals)<>'array'
    THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF jsonb_array_length(p_goals)>20 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 -- Defend SQL RPC callers that bypass the shared website/MCP Zod boundary.
 FOR v_goal IN SELECT value FROM jsonb_array_elements(p_goals) LOOP
   IF jsonb_typeof(v_goal)<>'object' OR
      coalesce(v_goal->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
      char_length(btrim(coalesce(v_goal->>'title',''))) NOT BETWEEN 1 AND 160 OR
      coalesce(v_goal->>'status','') NOT IN ('planned','in_progress','achieved','abandoned') OR
      char_length(coalesce(v_goal->>'coachEvidence',''))>1500 OR
      (v_goal->>'targetDate' IS NOT NULL AND
       v_goal->>'targetDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
      (v_goal->>'status'='achieved' AND
       char_length(btrim(coalesce(v_goal->>'coachEvidence','')))<10)
      THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   FOR v_key IN SELECT jsonb_object_keys(v_goal) LOOP
     IF v_key NOT IN ('id','title','status','targetDate','coachEvidence')
        THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
   END LOOP;
 END LOOP;
 IF (SELECT count(DISTINCT (v.value->>'id'))
       FROM jsonb_array_elements(p_goals) v)<>jsonb_array_length(p_goals)
   THEN RAISE EXCEPTION 'DUPLICATE_GOAL'; END IF;
 IF p_status='completed' AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_goals) v
   WHERE v.value->>'status' IN ('planned','in_progress'))
   THEN RAISE EXCEPTION 'INCOMPLETE_GOALS'; END IF;

 v_hash:=md5(jsonb_build_array(p_plan_id,p_expected_revision,
   p_student_id,btrim(p_title),coalesce(p_summary,''),p_status,p_goals)::text);
 -- Serialize receipt decisions for one teacher, including two competing
 -- requests accidentally reusing the same UUID for different students.
 PERFORM 1 FROM public.teachers WHERE id=v_teacher FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

 SELECT * INTO v_receipt FROM public.student_training_plan_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('planId',v_receipt.plan_id,
     'revision',v_receipt.revision,'replayed',true);
 END IF;

 SELECT s.archived_at INTO v_student_archived FROM public.students s
  WHERE s.id=p_student_id AND s.teacher_id=v_teacher FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_plan_id IS NULL THEN
   IF v_student_archived IS NOT NULL THEN RAISE EXCEPTION 'STUDENT_ARCHIVED'; END IF;
   INSERT INTO public.student_training_plans
      (teacher_id,student_id,title,summary,status,goals)
   VALUES(v_teacher,p_student_id,btrim(p_title),coalesce(p_summary,''),p_status,p_goals)
   RETURNING id,revision INTO v_id,v_revision;
 ELSE
   SELECT * INTO v_existing FROM public.student_training_plans
    WHERE id=p_plan_id AND teacher_id=v_teacher FOR UPDATE;
   IF NOT FOUND OR v_existing.student_id<>p_student_id
      THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF v_existing.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
   UPDATE public.student_training_plans
     SET title=btrim(p_title),summary=coalesce(p_summary,''),
       status=p_status,goals=p_goals,revision=revision+1,
       updated_at=clock_timestamp()
     WHERE id=p_plan_id AND teacher_id=v_teacher
     RETURNING id,revision INTO v_id,v_revision;
 END IF;
 INSERT INTO public.student_training_plan_revisions(teacher_id,plan_id,revision,snapshot)
 SELECT v_teacher,v_id,v_revision,jsonb_build_object(
   'title',p.title,'summary',p.summary,'status',p.status,'goals',p.goals,
   'studentId',p.student_id,'revision',p.revision)
 FROM public.student_training_plans p WHERE p.id=v_id AND p.teacher_id=v_teacher;
 INSERT INTO public.student_training_plan_receipts
   (teacher_id,request_id,request_hash,plan_id,revision)
 VALUES(v_teacher,p_request_id,v_hash,v_id,v_revision);
 RETURN jsonb_build_object('planId',v_id,'revision',v_revision,'replayed',false);
END;
$commit$;
REVOKE ALL ON FUNCTION public.ccp_student_training_plan_commit(
 uuid,bigint,uuid,text,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_student_training_plan_commit(
 uuid,bigint,uuid,text,text,text,jsonb,uuid) TO authenticated;
