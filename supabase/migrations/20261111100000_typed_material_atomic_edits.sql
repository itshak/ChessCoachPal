-- Typed chess material corrections: shared website/MCP idempotent, owner-scoped,
-- revision-guarded root+subtype edits. Fresh installs only; never reset real data.
ALTER TABLE public.learning_materials
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE public.learning_material_edit_receipts (
  teacher_id uuid NOT NULL,
  request_id uuid NOT NULL,
  material_id uuid NOT NULL,
  request_hash text NOT NULL,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id,request_id),
  FOREIGN KEY (teacher_id,material_id)
    REFERENCES public.learning_materials(teacher_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.learning_material_edit_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_material_edits_owner ON public.learning_material_edit_receipts
  FOR SELECT TO authenticated USING (teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_edit_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_catalog_update(
 p_material_id uuid,p_expected_revision bigint,p_kind text,
 p_title text,p_description text,p_source_url text,p_details jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $update_material$
DECLARE
 v_teacher uuid := auth.uid();
 v_root public.learning_materials%ROWTYPE;
 v_hash text;
 v_receipt public.learning_material_edit_receipts%ROWTYPE;
 v_rows integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_material_id IS NULL OR p_request_id IS NULL OR p_expected_revision IS NULL OR
    p_expected_revision < 1 OR p_kind NOT IN ('game','puzzle','drill','study_chapter','external_link') OR
    char_length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 160 OR
    char_length(coalesce(p_description,'')) > 4000 OR
    (p_source_url IS NOT NULL AND
     (p_source_url !~ '^https://[^[:space:]]+$' OR char_length(p_source_url)>2048)) OR
    p_details IS NULL OR jsonb_typeof(p_details)<>'object' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR';
 END IF;
 v_hash:=md5(jsonb_build_array(p_material_id,p_expected_revision,p_kind,
    btrim(p_title),coalesce(p_description,''),p_source_url,p_details)::text);

 SELECT * INTO v_receipt FROM public.learning_material_edit_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.material_id<>p_material_id OR v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_receipt.material_id,
     'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;

 SELECT * INTO v_root FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Another caller may have committed the identical request while we waited
 -- for the row lock; re-read its receipt BEFORE comparing stale revisions.
 SELECT * INTO v_receipt FROM public.learning_material_edit_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.material_id<>p_material_id OR v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',v_receipt.material_id,
     'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 IF v_root.kind<>p_kind THEN RAISE EXCEPTION 'KIND_MISMATCH'; END IF;
 IF v_root.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;

 IF p_kind IN ('study_chapter','external_link') AND p_source_url IS NULL
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 IF p_kind='external_link' AND p_details <> '{}'::jsonb
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;

 IF p_kind='game' THEN
   IF char_length(btrim(coalesce(p_details->>'pgn',''))) NOT BETWEEN 1 AND 150000 OR
      char_length(coalesce(p_details->>'whitePlayer',''))>120 OR
      char_length(coalesce(p_details->>'blackPlayer',''))>120 OR
      coalesce(p_details->>'result','*') NOT IN ('1-0','0-1','1/2-1/2','*')
     THEN RAISE EXCEPTION 'INVALID_GAME'; END IF;
   UPDATE public.chess_games SET pgn=p_details->>'pgn',
     white_player=coalesce(p_details->>'whitePlayer',''),
     black_player=coalesce(p_details->>'blackPlayer',''),
     result=coalesce(p_details->>'result','*')
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='puzzle' THEN
   IF char_length(btrim(coalesce(p_details->>'fen',''))) NOT BETWEEN 15 AND 150 OR
      jsonb_typeof(coalesce(p_details->'themes','[]'::jsonb))<>'array'
     THEN RAISE EXCEPTION 'INVALID_PUZZLE'; END IF;
   UPDATE public.chess_puzzles SET fen=p_details->>'fen',
     solution=p_details->>'solution',
     themes=ARRAY(SELECT jsonb_array_elements_text(
       coalesce(p_details->'themes','[]'::jsonb)))
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='drill' THEN
   IF char_length(btrim(coalesce(p_details->>'instructions',''))) NOT BETWEEN 1 AND 5000
     THEN RAISE EXCEPTION 'INVALID_DRILL'; END IF;
   UPDATE public.chess_drills SET
     instructions=p_details->>'instructions',
     mode=coalesce(p_details->>'mode','other'),
     repetitions=(p_details->>'repetitions')::integer
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSIF p_kind='study_chapter' THEN
   IF char_length(btrim(coalesce(p_details->>'studyId',''))) NOT BETWEEN 1 AND 128
     THEN RAISE EXCEPTION 'INVALID_CHAPTER'; END IF;
   UPDATE public.chess_study_chapters SET
     provider=coalesce(p_details->>'provider','lichess'),
     study_id=p_details->>'studyId',chapter_id=nullif(p_details->>'chapterId','')
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
 ELSE
   -- An external link stores its metadata in the root, not a subtype row.
   v_rows:=1;
 END IF;

 IF p_kind<>'external_link' THEN
   GET DIAGNOSTICS v_rows=ROW_COUNT;
   IF v_rows<>1 THEN RAISE EXCEPTION 'MISSING_SUBTYPE'; END IF;
 END IF;

 UPDATE public.learning_materials SET title=btrim(p_title),
   description=coalesce(p_description,''),source_url=p_source_url,
   revision=revision+1,updated_at=clock_timestamp()
   WHERE teacher_id=v_teacher AND id=p_material_id;

 INSERT INTO public.learning_material_edit_receipts
   (teacher_id,request_id,material_id,request_hash,resulting_revision)
 VALUES(v_teacher,p_request_id,p_material_id,v_hash,v_root.revision+1);
 RETURN jsonb_build_object('id',p_material_id,
   'revision',v_root.revision+1,'replayed',false);
END;
$update_material$;

REVOKE ALL ON FUNCTION public.ccp_material_catalog_update(
  uuid,bigint,text,text,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_catalog_update(
  uuid,bigint,text,text,text,text,jsonb,uuid) TO authenticated;
