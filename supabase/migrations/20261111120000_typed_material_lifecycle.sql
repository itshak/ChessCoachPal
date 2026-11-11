-- Safe, history-preserving material library archive/restore.
-- Never delete a material and cascade away an existing assignment or source link.
ALTER TABLE public.learning_materials
 ADD COLUMN archived_at timestamptz;
CREATE INDEX learning_materials_active_idx ON public.learning_materials(teacher_id,archived_at,created_at DESC);

CREATE TABLE public.learning_material_lifecycle_receipts(
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 material_id uuid NOT NULL,
 request_hash text NOT NULL,
 action text NOT NULL CHECK(action IN ('archive','restore')),
 resulting_revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.learning_material_lifecycle_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_material_lifecycle_receipts ON public.learning_material_lifecycle_receipts
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_lifecycle_receipts TO authenticated;

CREATE FUNCTION public.ccp_material_lifecycle_change(
 p_material_id uuid,p_expected_revision bigint,p_action text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path='' AS $lifecycle$
DECLARE
 v_teacher uuid:=auth.uid();
 v_root public.learning_materials%ROWTYPE;
 v_old public.learning_material_lifecycle_receipts%ROWTYPE;
 v_hash text;
 v_assignments integer;
 v_relations integer;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_material_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
    OR p_action NOT IN ('archive','restore') OR p_request_id IS NULL
 THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 v_hash:=md5(jsonb_build_array(p_material_id,p_expected_revision,p_action)::text);
 SELECT * INTO v_old FROM public.learning_material_lifecycle_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_old.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('materialId',v_old.material_id,'action',v_old.action,
    'revision',v_old.resulting_revision,'replayed',true);
 END IF;
 SELECT * INTO v_root FROM public.learning_materials
   WHERE teacher_id=v_teacher AND id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v_root.revision<>p_expected_revision THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
 IF p_action='archive' THEN
   IF v_root.archived_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ARCHIVED'; END IF;
   SELECT count(*) INTO v_assignments FROM public.training_assignments
     WHERE teacher_id=v_teacher AND material_id=p_material_id;
   SELECT count(*) INTO v_relations FROM public.learning_material_relations
     WHERE teacher_id=v_teacher AND
      (from_material_id=p_material_id OR to_material_id=p_material_id);
   IF v_assignments>0 OR v_relations>0
     THEN RAISE EXCEPTION 'HISTORY_DEPENDENCIES'; END IF;
   UPDATE public.learning_materials SET archived_at=clock_timestamp(),
     updated_at=clock_timestamp(),revision=revision+1
     WHERE teacher_id=v_teacher AND id=p_material_id;
 ELSE
   IF v_root.archived_at IS NULL THEN RAISE EXCEPTION 'NOT_ARCHIVED'; END IF;
   UPDATE public.learning_materials SET archived_at=NULL,
     updated_at=clock_timestamp(),revision=revision+1
     WHERE teacher_id=v_teacher AND id=p_material_id;
 END IF;
 INSERT INTO public.learning_material_lifecycle_receipts
   (teacher_id,request_id,material_id,request_hash,action,resulting_revision)
 VALUES(v_teacher,p_request_id,p_material_id,v_hash,p_action,v_root.revision+1);
 RETURN jsonb_build_object('materialId',p_material_id,'action',p_action,
   'revision',v_root.revision+1,'replayed',false);
END;
$lifecycle$;
REVOKE ALL ON FUNCTION public.ccp_material_lifecycle_change(uuid,bigint,text,uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_material_lifecycle_change(uuid,bigint,text,uuid)
 TO authenticated;
