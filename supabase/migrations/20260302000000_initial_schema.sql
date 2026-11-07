-- Enums
CREATE TYPE clef_type AS ENUM ('treble', 'bass', 'both');
CREATE TYPE practice_mode AS ENUM ('lesson', 'free_practice', 'flashcard');

-- Teachers (mirrors Supabase auth.users)
CREATE TABLE teachers (
  id          uuid PRIMARY KEY,  -- same as auth.users.id
  email       text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Students
CREATE TABLE students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name           text NOT NULL,
  parent_contact text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id)
);
CREATE INDEX idx_students_teacher ON students(teacher_id);

-- Plans
CREATE TABLE plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id           uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  is_template          boolean NOT NULL DEFAULT false,
  clef                 clef_type NOT NULL DEFAULT 'treble',
  key_signature        text NOT NULL DEFAULT 'C major',
  include_sharps       boolean NOT NULL DEFAULT false,
  include_flats        boolean NOT NULL DEFAULT false,
  include_chords       boolean NOT NULL DEFAULT false,
  measures_shown       int NOT NULL DEFAULT 1 CHECK (measures_shown IN (1, 2)),
  questions_per_lesson int NOT NULL DEFAULT 10 CHECK (questions_per_lesson BETWEEN 5 AND 30),
  answer_choices       int NOT NULL DEFAULT 4 CHECK (answer_choices BETWEEN 2 AND 7),
  notes                jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plans_teacher ON plans(teacher_id);

-- Student ↔ Plan assignments
CREATE TABLE student_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_date    date
);
CREATE INDEX idx_student_plans_token ON student_plans(token);
CREATE INDEX idx_student_plans_student ON student_plans(student_id);

-- Practice sessions
CREATE TABLE practice_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_plan_id uuid NOT NULL REFERENCES student_plans(id) ON DELETE CASCADE,
  mode            practice_mode NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  total_correct   int NOT NULL DEFAULT 0,
  total_incorrect int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0
);
CREATE INDEX idx_sessions_student_plan ON practice_sessions(student_plan_id);

-- Individual note attempts within a session
CREATE TABLE note_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  note_displayed   text NOT NULL,
  clef             text NOT NULL CHECK (clef IN ('treble', 'bass')),
  correct_answer   text NOT NULL,
  student_answer   text NOT NULL,
  is_correct       boolean NOT NULL,
  response_time_ms int,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_session ON note_attempts(session_id);

-- Flashcard spaced-repetition state
CREATE TABLE flashcard_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_plan_id uuid NOT NULL REFERENCES student_plans(id) ON DELETE CASCADE,
  note            text NOT NULL,
  clef            text NOT NULL CHECK (clef IN ('treble', 'bass')),
  ease_factor     float NOT NULL DEFAULT 2.5,
  interval_days   int NOT NULL DEFAULT 0,
  repetitions     int NOT NULL DEFAULT 0,
  next_review     timestamptz NOT NULL DEFAULT now(),
  last_reviewed   timestamptz,
  UNIQUE (student_plan_id, note, clef)
);
CREATE INDEX idx_flashcard_student_plan ON flashcard_progress(student_plan_id);

-- Auto-update updated_at on plans
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ChessCoachPal authoritative pre-1.0 teaching schema. Fresh installations only.
-- ADR-0001: amend the baseline; do not ship compatibility migrations.
CREATE TABLE public.workplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 0 AND 120 AND char_length(btrim(name)) > 0),
  timezone text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 80),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  locale text NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'),
  policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(policy) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id),
  UNIQUE (teacher_id, name)
);
CREATE INDEX workplaces_teacher_idx ON public.workplaces(teacher_id);

-- Canonical student enrollment across independently managed teacher workplaces.
CREATE TABLE public.workplace_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  workplace_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, workplace_id, student_id),
  FOREIGN KEY (workplace_id, teacher_id)
    REFERENCES public.workplaces(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, teacher_id)
    REFERENCES public.students(id, teacher_id) ON DELETE CASCADE
);
CREATE INDEX workplace_enrollments_student_idx
  ON public.workplace_enrollments(teacher_id, student_id);

CREATE TABLE public.class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  workplace_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id),
  UNIQUE (id, teacher_id, workplace_id),
  UNIQUE (teacher_id, workplace_id, name),
  FOREIGN KEY (workplace_id, teacher_id)
    REFERENCES public.workplaces(id, teacher_id) ON DELETE CASCADE
);
CREATE INDEX class_groups_workplace_idx ON public.class_groups(teacher_id, workplace_id);

CREATE TABLE public.group_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  workplace_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id),
  FOREIGN KEY (group_id, teacher_id, workplace_id)
    REFERENCES public.class_groups(id, teacher_id, workplace_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id, workplace_id, student_id)
    REFERENCES public.workplace_enrollments(teacher_id, workplace_id, student_id) ON DELETE CASCADE,
  -- Keep a direct student relationship for PostgREST's embedded roster query.
  FOREIGN KEY (student_id, teacher_id)
    REFERENCES public.students(id, teacher_id) ON DELETE CASCADE
);
CREATE INDEX group_enrollments_teacher_student_idx ON public.group_enrollments(teacher_id, student_id);

CREATE TABLE public.teaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  workplace_id uuid NOT NULL,
  group_id uuid,
  student_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lesson_note text NOT NULL DEFAULT '' CHECK (char_length(lesson_note) <= 10000),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id),
  UNIQUE (teacher_id, request_id),
  CHECK ((group_id IS NULL) <> (student_id IS NULL)),
  FOREIGN KEY (workplace_id, teacher_id)
    REFERENCES public.workplaces(id, teacher_id),
  FOREIGN KEY (group_id, teacher_id, workplace_id)
    REFERENCES public.class_groups(id, teacher_id, workplace_id),
  FOREIGN KEY (teacher_id, workplace_id, student_id)
    REFERENCES public.workplace_enrollments(teacher_id, workplace_id, student_id)
);
CREATE INDEX teaching_sessions_teacher_start_idx
  ON public.teaching_sessions(teacher_id, starts_at DESC);

-- Freeze the group roster when the class session is created, so a later
-- enrollment change cannot silently change the historical register.
CREATE TABLE public.session_participants (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id, teacher_id)
    REFERENCES public.teaching_sessions(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, teacher_id)
    REFERENCES public.students(id, teacher_id)
);
CREATE INDEX session_participants_teacher_idx ON public.session_participants(teacher_id, session_id);

CREATE TABLE public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'unmarked' CHECK (status IN ('unmarked', 'present', 'absent', 'late', 'excused')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 5000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  FOREIGN KEY (session_id, teacher_id)
    REFERENCES public.teaching_sessions(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id, teacher_id)
    REFERENCES public.students(id, teacher_id),
  FOREIGN KEY (session_id, student_id)
    REFERENCES public.session_participants(session_id, student_id)
);
CREATE INDEX session_attendance_teacher_idx ON public.session_attendance(teacher_id, session_id);


-- The default workplace is created when a teacher is created, rather than
-- backfilling prior versions. Changing schema requires intentional reset.
CREATE OR REPLACE FUNCTION public.chesscoachpal_seed_workplace()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.workplaces(teacher_id, name, timezone, currency)
  VALUES (NEW.id, 'Private coaching', 'UTC', 'USD');
  RETURN NEW;
END;
$$;
CREATE TRIGGER chesscoachpal_seed_workplace
AFTER INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.chesscoachpal_seed_workplace();

-- Snapshot attendees at creation. Attendance can be marked only for this
-- snapshot, not for current enrollment state.
CREATE OR REPLACE FUNCTION public.chesscoachpal_snapshot_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    INSERT INTO public.session_participants(teacher_id, session_id, student_id)
    VALUES (NEW.teacher_id, NEW.id, NEW.student_id);
  ELSE
    INSERT INTO public.session_participants(teacher_id, session_id, student_id)
    SELECT NEW.teacher_id, NEW.id, e.student_id
    FROM public.group_enrollments e
    WHERE e.teacher_id = NEW.teacher_id AND e.group_id = NEW.group_id;
  END IF;
  -- Create one and only one initially unmarked register row per snapshot member.
  INSERT INTO public.session_attendance(teacher_id, session_id, student_id, status)
  SELECT NEW.teacher_id, NEW.id, p.student_id, 'unmarked'
  FROM public.session_participants p
  WHERE p.teacher_id = NEW.teacher_id AND p.session_id = NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chesscoachpal_snapshot_participants
AFTER INSERT ON public.teaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.chesscoachpal_snapshot_participants();


-- Milestone 2: OAuth delegated grants and atomic agent writes.
-- Fresh pre-1.0 schema only: no CogNote or historical ChessCoachPal migrations.
-- These credential tables are server-only. Never expose them to authenticated or anon.
CREATE TABLE public.agent_oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  redirect_uris jsonb NOT NULL CHECK (jsonb_typeof(redirect_uris) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.agent_oauth_clients(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  resource text NOT NULL,
  scopes text NOT NULL,
  challenge text NOT NULL,
  encrypted_session text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX agent_codes_expiry_idx ON public.agent_oauth_codes(expires_at);
CREATE TABLE public.agent_oauth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.agent_oauth_clients(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  resource text NOT NULL,
  scopes text NOT NULL,
  access_hash text NOT NULL UNIQUE,
  refresh_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  encrypted_session text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX agent_grants_teacher_idx ON public.agent_oauth_grants(teacher_id, revoked_at);
CREATE TABLE public.agent_tool_receipts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, idempotency_key)
);
CREATE INDEX agent_receipts_created_idx ON public.agent_tool_receipts(created_at);

ALTER TABLE public.agent_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_oauth_clients, public.agent_oauth_codes, public.agent_oauth_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_oauth_clients, public.agent_oauth_codes, public.agent_oauth_grants TO service_role;
REVOKE ALL ON public.agent_tool_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_tool_receipts TO service_role;
-- Receipts are immutable to teachers/clients; only the teacher-checked RPC may write.

-- Privileged functions protect append-only receipts. Each checks auth.uid() and
-- applies explicit teacher_id predicates on every domain mutation, so callers
-- cannot set or impersonate the teacher; raw business tools remain RLS scoped.
-- One unique idempotency claim and the mutation share ONE transaction.
CREATE OR REPLACE FUNCTION public.agent_record_attendance(
  p_session_id uuid, p_student_id uuid, p_status text, p_note text,
  p_expected_updated_at timestamptz, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_updated public.session_attendance%ROWTYPE;
  v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_status NOT IN ('present','absent','late','excused') OR
      char_length(coalesce(p_note,'')) > 5000 OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
  END IF;
  v_hash := md5(jsonb_build_array(p_session_id,p_student_id,p_status,p_note,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,'attendance.record',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF v_saved.operation <> 'attendance.record' OR v_saved.request_hash <> v_hash THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;
    RETURN v_saved.receipt;
  END IF;
  UPDATE public.session_attendance SET status = p_status, note = coalesce(p_note,''),
    updated_at = clock_timestamp()
  WHERE teacher_id = v_teacher AND session_id = p_session_id AND student_id = p_student_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
  v_receipt := jsonb_build_object('operation','attendance.record',
    'sessionId',p_session_id,'studentId',p_student_id,'status',p_status,
    'revision',v_updated.updated_at,'timestamp',now(),'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt = v_receipt
  WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
  RETURN v_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_update_session_note(
  p_session_id uuid, p_lesson_note text, p_expected_updated_at timestamptz,
  p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_teacher uuid := auth.uid();
  v_hash text;
  v_saved public.agent_tool_receipts%ROWTYPE;
  v_updated public.teaching_sessions%ROWTYPE;
  v_receipt jsonb;
BEGIN
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_lesson_note IS NULL OR char_length(p_lesson_note) > 10000
      OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  v_hash := md5(jsonb_build_array(p_session_id,p_lesson_note,p_expected_updated_at)::text);
  INSERT INTO public.agent_tool_receipts(teacher_id,idempotency_key,operation,request_hash,receipt)
  VALUES(v_teacher,p_idempotency_key,'sessions.note.update',v_hash,'{}'::jsonb)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_saved FROM public.agent_tool_receipts
    WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
    IF v_saved.operation <> 'sessions.note.update' OR v_saved.request_hash <> v_hash THEN
      RAISE EXCEPTION 'CONFLICT';
    END IF;
    RETURN v_saved.receipt;
  END IF;
  UPDATE public.teaching_sessions SET lesson_note = p_lesson_note,
    updated_at = clock_timestamp()
  WHERE teacher_id = v_teacher AND id = p_session_id
    AND updated_at = p_expected_updated_at
  RETURNING * INTO v_updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT_OR_NOT_FOUND'; END IF;
  v_receipt := jsonb_build_object('operation','sessions.note.update',
    'sessionId',p_session_id,'revision',v_updated.updated_at,
    'timestamp',now(),'idempotencyKey',p_idempotency_key);
  UPDATE public.agent_tool_receipts SET receipt = v_receipt
  WHERE teacher_id = v_teacher AND idempotency_key = p_idempotency_key;
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_record_attendance(uuid,uuid,text,text,timestamptz,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_update_session_note(uuid,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_record_attendance(uuid,uuid,text,text,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_update_session_note(uuid,text,timestamptz,uuid) TO authenticated;


-- Milestone 3: chess-specific learning records, fresh-install-only (ADR-0001).
-- Composite ownership FKs and frozen-session-roster FKs prevent foreign or
-- unrelated students from being attached to a lesson's observation or link.
CREATE TABLE public.chess_skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id),
  UNIQUE (teacher_id, name)
);
CREATE INDEX chess_skill_categories_teacher_idx ON public.chess_skill_categories(teacher_id, sort_order);

CREATE TABLE public.chess_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  session_id uuid,
  category_id uuid NOT NULL,
  observation text NOT NULL CHECK (char_length(btrim(observation)) BETWEEN 1 AND 5000),
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('teacher', 'agent')),
  verified_at timestamptz,
  verified_by uuid,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, request_id),
  CHECK (verified_by IS NULL OR verified_by = teacher_id),
  CHECK ((verified_at IS NULL) = (verified_by IS NULL)),
  CHECK (source <> 'teacher' OR verified_at IS NOT NULL),
  FOREIGN KEY (student_id, teacher_id) REFERENCES public.students(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, teacher_id) REFERENCES public.teaching_sessions(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, teacher_id) REFERENCES public.chess_skill_categories(id, teacher_id),
  FOREIGN KEY (session_id, student_id) REFERENCES public.session_participants(session_id, student_id)
);
CREATE INDEX chess_observations_history_idx ON public.chess_observations(teacher_id, student_id, observed_at DESC);
CREATE INDEX chess_observations_session_idx ON public.chess_observations(teacher_id, session_id);

CREATE TABLE public.chess_learning_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid,
  session_id uuid,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 160),
  url text NOT NULL CHECK (char_length(url) BETWEEN 9 AND 2048 AND url ~ '^https://'),
  resource_type text NOT NULL CHECK (resource_type IN ('lichess_study', 'external')),
  provider_study_id text,
  provider_chapter_id text,
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, request_id),
  CHECK (student_id IS NOT NULL OR session_id IS NOT NULL),
  CHECK (
    (resource_type = 'lichess_study' AND provider_study_id ~ '^[a-zA-Z0-9]{8}$'
      AND (provider_chapter_id IS NULL OR provider_chapter_id ~ '^[a-zA-Z0-9]{8}$'))
    OR (resource_type = 'external' AND provider_study_id IS NULL AND provider_chapter_id IS NULL)
  ),
  FOREIGN KEY (student_id, teacher_id) REFERENCES public.students(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, teacher_id) REFERENCES public.teaching_sessions(id, teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id, student_id) REFERENCES public.session_participants(session_id, student_id)
);
CREATE INDEX chess_resources_student_idx ON public.chess_learning_resources(teacher_id, student_id, created_at DESC);
CREATE INDEX chess_resources_session_idx ON public.chess_learning_resources(teacher_id, session_id);

-- Defaults are created only for new teachers. No historical migration/backfill.
CREATE OR REPLACE FUNCTION public.chesscoachpal_seed_chess_skills()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.chess_skill_categories(teacher_id, name, sort_order) VALUES
    (NEW.id, 'Tactics', 10),
    (NEW.id, 'Calculation', 20),
    (NEW.id, 'Endgames', 30),
    (NEW.id, 'Strategy', 40),
    (NEW.id, 'Opening principles', 50),
    (NEW.id, 'Time management', 60);
  RETURN NEW;
END;
$$;
CREATE TRIGGER chesscoachpal_seed_chess_skills
AFTER INSERT ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.chesscoachpal_seed_chess_skills();
