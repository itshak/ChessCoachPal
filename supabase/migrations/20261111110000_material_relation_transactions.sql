-- Atomic, revision-checked typed chess material relationships.
-- Existing material root and typed detail rows remain intact on failed links.
CREATE TABLE public.learning_material_relation_receipts(
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  from_material_id uuid NOT NULL,
  to_material_id uuid NOT NULL,
  relation_type text NOT NULL,
  action text NOT NULL CHECK(action IN ('link','unlink')),
  request_hash text NOT NULL,
  resulting_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.learning_material_relation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_material_relation_receipts
 ON public.learning_material_relation_receipts FOR SELECT TO authenticated
 USING (teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_relation_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_relation_change(
  p_from_material_id uuid,p_to_material_id uuid,p_relation_type text,
  p_action text,p_expected_revision bigint,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $relation$
DECLARE
 v_teacher uuid:=auth.uid();
 v_locked integer;
 v_source public.learning_materials%ROWTYPE;
 v_target public.learning_materials%ROWTYPE;
 v_receipt public.learning_material_relation_receipts%ROWTYPE;
 v_hash text;
 v_count integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_from_material_id IS NULL OR p_to_material_id IS NULL OR
    p_from_material_id=p_to_material_id OR
    p_relation_type NOT IN ('extracted_from','derived_from','prerequisite') OR
    p_action NOT IN ('link','unlink') OR
    p_expected_revision IS NULL OR p_expected_revision<1 OR
    p_request_id IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 v_hash:=md5(jsonb_build_array(p_from_material_id,p_to_material_id,
   p_relation_type,p_action,p_expected_revision)::text);

 SELECT * INTO v_receipt FROM public.learning_material_relation_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('fromMaterialId',v_receipt.from_material_id,
     'toMaterialId',v_receipt.to_material_id,'relationType',v_receipt.relation_type,
     'action',v_receipt.action,'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 -- Stable lock order prevents opposite-direction writers from deadlocking.
 PERFORM 1 FROM public.learning_materials WHERE teacher_id=v_teacher
   AND id IN (p_from_material_id,p_to_material_id) ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS v_locked=ROW_COUNT;
 IF v_locked<>2 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 -- Recheck after ordered locks: identical concurrent requests replay rather
 -- than incorrectly reporting STALE_REVISION to the slower client.
 SELECT * INTO v_receipt FROM public.learning_material_relation_receipts
   WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_receipt.request_hash<>v_hash
     THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('fromMaterialId',v_receipt.from_material_id,
     'toMaterialId',v_receipt.to_material_id,'relationType',v_receipt.relation_type,
     'action',v_receipt.action,'revision',v_receipt.resulting_revision,'replayed',true);
 END IF;
 SELECT * INTO v_source FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_from_material_id;
 SELECT * INTO v_target FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_to_material_id;
 IF v_source.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
 IF p_relation_type='extracted_from' AND
    (v_source.kind<>'puzzle' OR v_target.kind<>'game')
   THEN RAISE EXCEPTION 'INVALID_RELATION_TYPES'; END IF;

 IF p_action='link' THEN
   INSERT INTO public.learning_material_relations
     (teacher_id,from_material_id,to_material_id,relation_type)
   VALUES(v_teacher,p_from_material_id,p_to_material_id,p_relation_type)
   ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'RELATION_ALREADY_EXISTS'; END IF;
 ELSE
   DELETE FROM public.learning_material_relations
    WHERE teacher_id=v_teacher AND from_material_id=p_from_material_id
      AND to_material_id=p_to_material_id AND relation_type=p_relation_type;
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'RELATION_NOT_FOUND'; END IF;
 END IF;

 UPDATE public.learning_materials SET
   revision=revision+1,updated_at=clock_timestamp()
   WHERE teacher_id=v_teacher AND id=p_from_material_id;
 INSERT INTO public.learning_material_relation_receipts
   (teacher_id,request_id,from_material_id,to_material_id,relation_type,
    action,request_hash,resulting_revision)
 VALUES(v_teacher,p_request_id,p_from_material_id,p_to_material_id,
   p_relation_type,p_action,v_hash,v_source.revision+1);
 RETURN jsonb_build_object('fromMaterialId',p_from_material_id,
   'toMaterialId',p_to_material_id,'relationType',p_relation_type,
   'action',p_action,'revision',v_source.revision+1,'replayed',false);
END;
$relation$;
REVOKE ALL ON FUNCTION public.ccp_material_relation_change(
 uuid,uuid,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_relation_change(
 uuid,uuid,text,text,bigint,uuid) TO authenticated;
