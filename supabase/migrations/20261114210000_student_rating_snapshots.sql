-- Pre-1.0 additive canonical student chess rating history.
-- Manual observations are direct authenticated owner writes; public-provider
-- observations only originate from trusted server-side service-role fetch.
CREATE TABLE IF NOT EXISTS public.student_rating_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('lichess','chesscom')),
  time_control text NOT NULL CHECK (time_control IN (
    'bullet','blitz','rapid','classical','daily','puzzle')),
  rating integer NOT NULL CHECK (rating BETWEEN 100 AND 4000),
  rating_deviation integer CHECK (rating_deviation BETWEEN 0 AND 1000),
  provisional boolean,
  games integer CHECK (games BETWEEN 0 AND 10000000),
  source text NOT NULL CHECK (source IN ('teacher_manual','provider_api')),
  observed_at timestamptz NOT NULL,
  fetched_at timestamptz,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccp_snapshot_student_owner FOREIGN KEY(student_id,teacher_id)
    REFERENCES public.students(id,teacher_id) ON DELETE RESTRICT,
  CONSTRAINT ccp_snapshot_source_time CHECK (
    (source='teacher_manual' AND fetched_at IS NULL) OR
    (source='provider_api' AND fetched_at IS NOT NULL)),
  CONSTRAINT ccp_snapshot_category_check CHECK (
    (provider='lichess' AND time_control<>'daily') OR
    (provider='chesscom' AND time_control<>'classical')),
  UNIQUE(teacher_id,request_id,time_control)
);
CREATE INDEX ccp_rating_snapshot_recent ON public.student_rating_snapshots
 (teacher_id,student_id,provider,time_control,observed_at DESC,id DESC);
ALTER TABLE public.student_rating_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_rating_snapshot_read ON public.student_rating_snapshots;
CREATE POLICY ccp_rating_snapshot_read ON public.student_rating_snapshots
  FOR SELECT TO authenticated USING (teacher_id=auth.uid());
DROP POLICY IF EXISTS ccp_rating_snapshot_manual ON public.student_rating_snapshots;
CREATE POLICY ccp_rating_snapshot_manual ON public.student_rating_snapshots
  FOR INSERT TO authenticated WITH CHECK (
    teacher_id=auth.uid() AND source='teacher_manual' AND fetched_at IS NULL);
REVOKE ALL ON public.student_rating_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.student_rating_snapshots TO authenticated;
GRANT ALL ON public.student_rating_snapshots TO service_role;
-- Immutable evidence: no authenticated UPDATE or DELETE privileges.

-- Retain the exact reviewed digest and the saved account handle for verified
-- provider batch replays. An identical request key with a changed digest or
-- account must fail; a teacher's manual key must be unique across controls.
ALTER TABLE public.student_rating_snapshots
 ADD COLUMN preview_digest text CHECK(preview_digest IS NULL OR preview_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN source_username text CHECK(source_username IS NULL OR char_length(source_username) BETWEEN 2 AND 30);
ALTER TABLE public.student_rating_snapshots
 ADD CONSTRAINT ccp_rating_snapshot_provenance CHECK(
   (source='teacher_manual' AND preview_digest IS NULL AND source_username IS NULL)
   OR
   (source='provider_api' AND preview_digest IS NOT NULL AND source_username IS NOT NULL));
CREATE UNIQUE INDEX ccp_manual_rating_request_unique
 ON public.student_rating_snapshots(teacher_id,request_id)
 WHERE source='teacher_manual';
