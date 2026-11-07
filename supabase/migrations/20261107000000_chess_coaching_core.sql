-- ChessCoachPal phase 1: additive teacher-owned workplaces, groups and lessons.
-- No legacy CogNote table is dropped or rewritten by this migration.
ALTER TABLE public.students ADD CONSTRAINT students_id_teacher_unique UNIQUE (id, teacher_id);

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
    REFERENCES public.students(id, teacher_id)
);
CREATE INDEX session_attendance_teacher_idx ON public.session_attendance(teacher_id, session_id);

-- A default workplace is created only for already-existing teacher accounts.
INSERT INTO public.workplaces (teacher_id, name, timezone)
SELECT t.id, 'Private coaching', COALESCE(NULLIF(p.timezone, ''), 'UTC')
FROM public.teachers t
LEFT JOIN public.studio_policies p ON p.teacher_id = t.id
ON CONFLICT (teacher_id, name) DO NOTHING;

ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY workplaces_teacher ON public.workplaces
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY class_groups_teacher ON public.class_groups
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY group_enrollments_teacher ON public.group_enrollments
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY teaching_sessions_teacher ON public.teaching_sessions
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY session_attendance_teacher ON public.session_attendance
  FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.workplaces, public.class_groups, public.group_enrollments,
  public.teaching_sessions, public.session_attendance TO authenticated;
REVOKE ALL ON
  public.workplaces, public.class_groups, public.group_enrollments,
  public.teaching_sessions, public.session_attendance FROM anon;
