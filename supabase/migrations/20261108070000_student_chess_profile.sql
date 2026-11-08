-- Teacher-owned chess student profile. All values are teacher-entered; no provider rating verification is implied.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS name_aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS strength smallint,
  ADD COLUMN IF NOT EXISTS lichess_username text,
  ADD COLUMN IF NOT EXISTS chesscom_username text,
  ADD COLUMN IF NOT EXISTS lichess_rating integer,
  ADD COLUMN IF NOT EXISTS chesscom_rating integer;
ALTER TABLE public.students
  ADD CONSTRAINT ccp_students_strength_range CHECK (strength IS NULL OR strength BETWEEN 1 AND 10),
  ADD CONSTRAINT ccp_students_lichess_rating_range CHECK (lichess_rating IS NULL OR lichess_rating BETWEEN 100 AND 4000),
  ADD CONSTRAINT ccp_students_chesscom_rating_range CHECK (chesscom_rating IS NULL OR chesscom_rating BETWEEN 100 AND 4000),
  ADD CONSTRAINT ccp_students_alias_limit CHECK (cardinality(name_aliases) <= 20);
-- A searchable derived field keeps multilingual names and aliases in the same roster query.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS name_search text GENERATED ALWAYS AS (
    lower(name || ' ' || array_to_string(name_aliases, ' '))
  ) STORED;
CREATE INDEX IF NOT EXISTS ccp_students_teacher_active_name ON public.students(teacher_id, archived_at, name);
