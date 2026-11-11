-- Explicit, reversible teacher-approved reconciliation of old material links
-- with the typed chess catalog. The historical learning and lesson evidence
-- remains attached to its original immutable resource ID; no automatic
-- "material was taught" inferences or destructive remapping.
ALTER TABLE public.chess_learning_resources
 ADD CONSTRAINT chess_learning_resources_id_teacher_unique UNIQUE (id,teacher_id);

CREATE TABLE public.learning_material_legacy_links (
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 resource_id uuid NOT NULL,
 material_id uuid NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 linked_by text NOT NULL DEFAULT 'teacher_confirmed' CHECK(linked_by='teacher_confirmed'),
 PRIMARY KEY(teacher_id,resource_id),
 FOREIGN KEY (resource_id,teacher_id)
   REFERENCES public.chess_learning_resources(id,teacher_id) ON DELETE RESTRICT,
 FOREIGN KEY (teacher_id,material_id)
   REFERENCES public.learning_materials(teacher_id,id) ON DELETE RESTRICT
);
CREATE INDEX learning_material_legacy_links_by_material
 ON public.learning_material_legacy_links(teacher_id,material_id);
ALTER TABLE public.learning_material_legacy_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_learning_material_legacy_links
 ON public.learning_material_legacy_links FOR SELECT TO authenticated
 USING(teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_legacy_links TO authenticated;

CREATE TABLE public.learning_material_legacy_link_receipts (
 teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 material_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('link','unlink')),
 request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(teacher_id,request_id)
);
ALTER TABLE public.learning_material_legacy_link_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_learning_material_legacy_link_receipts
 ON public.learning_material_legacy_link_receipts FOR SELECT TO authenticated
 USING(teacher_id=auth.uid());
GRANT SELECT ON public.learning_material_legacy_link_receipts TO authenticated;

CREATE FUNCTION public.ccp_legacy_material_bridge_change(
 p_resource_id uuid,p_material_id uuid,p_action text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 AS $bridge$
DECLARE
 v_teacher uuid:=auth.uid();
 v_resource public.chess_learning_resources%ROWTYPE;
 v_material public.learning_materials%ROWTYPE;
 v_old public.learning_material_legacy_links%ROWTYPE;
 v_receipt public.learning_material_legacy_link_receipts%ROWTYPE;
 v_hash text;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF p_resource_id IS NULL OR p_material_id IS NULL OR p_request_id IS NULL
    OR p_action NOT IN ('link','unlink') THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
 v_hash:=md5(jsonb_build_array(p_resource_id,p_material_id,p_action)::text);

 SELECT * INTO v_receipt FROM public.learning_material_legacy_link_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('resourceId',p_resource_id,
    'materialId',p_material_id,'action',p_action,'replayed',true);
 END IF;

 SELECT * INTO v_resource FROM public.chess_learning_resources
  WHERE teacher_id=v_teacher AND id=p_resource_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO v_material FROM public.learning_materials
  WHERE teacher_id=v_teacher AND id=p_material_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF v_material.archived_at IS NOT NULL THEN RAISE EXCEPTION 'MATERIAL_ARCHIVED'; END IF;
 -- Concurrent website/MCP retries may have committed while this request was
 -- waiting for the resource row. Recheck before deciding whether to mutate.
 SELECT * INTO v_receipt FROM public.learning_material_legacy_link_receipts
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
  IF v_receipt.request_hash<>v_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('resourceId',p_resource_id,
    'materialId',p_material_id,'action',p_action,'replayed',true);
 END IF;

 SELECT * INTO v_old FROM public.learning_material_legacy_links
  WHERE teacher_id=v_teacher AND resource_id=p_resource_id;
 IF p_action='link' THEN
   IF FOUND THEN
     IF v_old.material_id=p_material_id THEN RAISE EXCEPTION 'ALREADY_LINKED'; END IF;
     RAISE EXCEPTION 'RESOURCE_ALREADY_MAPPED';
   END IF;
   -- Old Lichess study links must map to an explicit typed study/link, not
   -- silently become a game or puzzle without reviewed chess data.
   IF v_resource.resource_type='lichess_study' AND
      v_material.kind NOT IN ('study_chapter','external_link')
      THEN RAISE EXCEPTION 'INCOMPATIBLE_TYPES'; END IF;
   -- Never attach an old Lichess resource to an unrelated study: this is a
   -- teacher-reviewed identity mapping, not a speculative similarity match.
   IF v_resource.resource_type='lichess_study' AND v_material.kind='study_chapter'
     AND NOT EXISTS (
      SELECT 1 FROM public.chess_study_chapters c
      WHERE c.teacher_id=v_teacher AND c.material_id=p_material_id
        AND c.provider='lichess'
        AND c.study_id=v_resource.provider_study_id
        AND (v_resource.provider_chapter_id IS NULL
             OR c.chapter_id=v_resource.provider_chapter_id)
     ) THEN RAISE EXCEPTION 'INCOMPATIBLE_TYPES'; END IF;
   IF v_material.kind='external_link' AND
      v_material.source_url IS DISTINCT FROM v_resource.url
      THEN RAISE EXCEPTION 'INCOMPATIBLE_TYPES'; END IF;
   INSERT INTO public.learning_material_legacy_links(teacher_id,resource_id,material_id)
    VALUES(v_teacher,p_resource_id,p_material_id);
 ELSE
   IF NOT FOUND OR v_old.material_id<>p_material_id
     THEN RAISE EXCEPTION 'MAPPING_NOT_FOUND'; END IF;
   DELETE FROM public.learning_material_legacy_links
    WHERE teacher_id=v_teacher AND resource_id=p_resource_id AND material_id=p_material_id;
 END IF;
 INSERT INTO public.learning_material_legacy_link_receipts
   (teacher_id,request_id,resource_id,material_id,action,request_hash)
 VALUES(v_teacher,p_request_id,p_resource_id,p_material_id,p_action,v_hash);
 RETURN jsonb_build_object('resourceId',p_resource_id,'materialId',p_material_id,
  'action',p_action,'replayed',false);
END;
$bridge$;
REVOKE ALL ON FUNCTION public.ccp_legacy_material_bridge_change(
 uuid,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_legacy_material_bridge_change(
 uuid,uuid,text,uuid) TO authenticated;

-- Lock discipline: the bridge obtains the typed material row lock before
-- writing a mapping. This trigger runs under that same lock when an archive
-- is attempted, so a linked historical resource cannot be orphaned by
-- concurrent website/MCP archive requests.
CREATE FUNCTION public.ccp_guard_legacy_mapped_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
BEGIN
 IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL AND
    EXISTS(SELECT 1 FROM public.learning_material_legacy_links l
      WHERE l.teacher_id=OLD.teacher_id AND l.material_id=OLD.id)
 THEN RAISE EXCEPTION 'HISTORY_DEPENDENCIES'; END IF;
 RETURN NEW;
END;
$guard$;
CREATE TRIGGER guard_legacy_material_archive BEFORE UPDATE OF archived_at
 ON public.learning_materials FOR EACH ROW
 EXECUTE FUNCTION public.ccp_guard_legacy_mapped_archive();
REVOKE ALL ON FUNCTION public.ccp_guard_legacy_mapped_archive() FROM PUBLIC,anon,authenticated;
