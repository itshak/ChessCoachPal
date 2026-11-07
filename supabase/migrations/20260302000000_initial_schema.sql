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
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, teacher_id),
  UNIQUE (teacher_id, name)
);
CREATE INDEX workplaces_teacher_idx ON public.workplaces(teacher_id);

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
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id),
  FOREIGN KEY (group_id, teacher_id)
    REFERENCES public.class_groups(id, teacher_id) ON DELETE CASCADE,
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
  FOREIGN KEY (student_id, teacher_id)
    REFERENCES public.students(id, teacher_id)
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
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
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
  RETURN NEW;
END;
$$;
CREATE TRIGGER chesscoachpal_snapshot_participants
AFTER INSERT ON public.teaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.chesscoachpal_snapshot_participants();
