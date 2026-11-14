-- Tenant-scoped, sanitized provider study/chapter metadata (no raw PGN/tokens).
CREATE TABLE IF NOT EXISTS public.teacher_study_chapter_index (
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 study_id text NOT NULL CHECK(study_id ~ '^[A-Za-z0-9]{8}$'),
 chapter_id text NOT NULL CHECK(chapter_id ~ '^[A-Za-z0-9]{8}$'),
 chapter_number integer NOT NULL CHECK(chapter_number BETWEEN 1 AND 64),
 study_name text NOT NULL CHECK(length(study_name) BETWEEN 1 AND 300),
 chapter_name text NOT NULL CHECK(length(chapter_name) BETWEEN 1 AND 300),
 white_player text CHECK(white_player IS NULL OR length(white_player)<=200),
 black_player text CHECK(black_player IS NULL OR length(black_player)<=200),
 event_name text CHECK(event_name IS NULL OR length(event_name)<=300),
 game_date text CHECK(game_date IS NULL OR length(game_date)<=30),
 eco text CHECK(eco IS NULL OR length(eco)<=30),
 opening text CHECK(opening IS NULL OR length(opening)<=300),
 fen text CHECK(fen IS NULL OR length(fen)<=120),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,study_id,chapter_id),
 UNIQUE(teacher_id,study_id,chapter_number)
);
CREATE INDEX ccp_study_index_search ON public.teacher_study_chapter_index
 (teacher_id,study_id,chapter_number);
ALTER TABLE public.teacher_study_chapter_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_study_index_owner ON public.teacher_study_chapter_index;
CREATE POLICY ccp_study_index_owner ON public.teacher_study_chapter_index
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
REVOKE ALL ON public.teacher_study_chapter_index FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.teacher_study_chapter_index TO authenticated;
GRANT ALL ON public.teacher_study_chapter_index TO service_role;

-- One transaction removes stale chapter ordinals and writes exactly the
-- provider-confirmed list. No partial cache is visible on validation failure.
CREATE OR REPLACE FUNCTION public.ccp_teacher_study_index_replace(
 p_study_id text,p_chapters jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $index_replace$
DECLARE
 v_teacher uuid:=auth.uid();
 v_chapter jsonb;v_count integer:=0;v_now timestamptz:=clock_timestamp();
BEGIN
 IF v_teacher IS NULL THEN
   RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_study_id IS NULL OR p_study_id !~ '^[A-Za-z0-9]{8}$'
   OR p_chapters IS NULL OR jsonb_typeof(p_chapters)<>'array'
   OR jsonb_array_length(p_chapters) NOT BETWEEN 1 AND 64
   OR pg_column_size(p_chapters)>150000 THEN
   RAISE EXCEPTION 'STUDY_INDEX_INVALID' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  v_teacher::text||':'||p_study_id,0));
 -- Never delete existing index until all incoming records have passed
 -- provider identity/type/length validation.
 FOR v_chapter IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   IF jsonb_typeof(v_chapter)<>'object'
     OR v_chapter-'studyName'-'chapterId'-'chapterNumber'-'chapterName'
       -'white'-'black'-'event'-'date'-'eco'-'opening'-'fen'<>'{}'::jsonb
     OR coalesce(v_chapter->>'chapterId','') !~ '^[A-Za-z0-9]{8}$'
     OR coalesce(v_chapter->>'chapterNumber','') !~ '^[0-9]+$'
     OR (v_chapter->>'chapterNumber')::integer NOT BETWEEN 1 AND 64
     OR length(btrim(coalesce(v_chapter->>'studyName',''))) NOT BETWEEN 1 AND 300
     OR length(btrim(coalesce(v_chapter->>'chapterName',''))) NOT BETWEEN 1 AND 300
     OR length(coalesce(v_chapter->>'white',''))>200
     OR length(coalesce(v_chapter->>'black',''))>200
     OR length(coalesce(v_chapter->>'event',''))>300
     OR length(coalesce(v_chapter->>'date',''))>30
     OR length(coalesce(v_chapter->>'eco',''))>30
     OR length(coalesce(v_chapter->>'opening',''))>300
     OR length(coalesce(v_chapter->>'fen',''))>120 THEN
     RAISE EXCEPTION 'STUDY_INDEX_INVALID' USING ERRCODE='22023';END IF;
 END LOOP;
 DELETE FROM public.teacher_study_chapter_index
  WHERE teacher_id=v_teacher AND study_id=p_study_id;
 FOR v_chapter IN SELECT value FROM jsonb_array_elements(p_chapters) LOOP
   INSERT INTO public.teacher_study_chapter_index(
    teacher_id,study_id,chapter_id,chapter_number,study_name,chapter_name,
    white_player,black_player,event_name,game_date,eco,opening,fen,verified_at
   )VALUES(v_teacher,p_study_id,v_chapter->>'chapterId',
    (v_chapter->>'chapterNumber')::integer,
    v_chapter->>'studyName',v_chapter->>'chapterName',
    v_chapter->>'white',v_chapter->>'black',v_chapter->>'event',
    v_chapter->>'date',v_chapter->>'eco',v_chapter->>'opening',
    v_chapter->>'fen',v_now);
   v_count:=v_count+1;
 END LOOP;
 RETURN jsonb_build_object('studyId',p_study_id,'chapterCount',v_count,
  'verifiedAt',v_now,'pgDataStored',false);
END;
$index_replace$;
REVOKE ALL ON FUNCTION public.ccp_teacher_study_index_replace(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_teacher_study_index_replace(text,jsonb) TO authenticated;
