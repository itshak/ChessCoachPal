-- Verified teacher-approved Lichess puzzle imports get a durable at-most-once
-- publication receipt BEFORE the external provider request. Ambiguous provider
-- timeouts are never automatically repeated. One request ID and one exact
-- study+content hash cannot be published twice across the website and MCP.
CREATE TABLE public.lichess_puzzle_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  study_id text NOT NULL CHECK (study_id ~ '^[A-Za-z0-9]{8}$'),
  request_id uuid NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  chapter_name text NOT NULL CHECK(length(chapter_name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'attempted'
    CHECK(status IN ('attempted','published','failed')),
  provider_chapter_id text CHECK(provider_chapter_id IS NULL OR provider_chapter_id ~ '^[A-Za-z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE(teacher_id,request_id),
  UNIQUE(teacher_id,study_id,content_hash)
);
CREATE INDEX ccp_lichess_puzzle_publications_teacher
 ON public.lichess_puzzle_publications(teacher_id,created_at DESC);
ALTER TABLE public.lichess_puzzle_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_lichess_puzzle_publications_teacher
 ON public.lichess_puzzle_publications FOR ALL TO authenticated
 USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.lichess_puzzle_publications FROM anon,PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.lichess_puzzle_publications TO authenticated;
