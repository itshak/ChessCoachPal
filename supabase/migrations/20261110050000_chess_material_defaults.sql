-- Explicit teacher-selected default studies for workplaces and optional groups.
-- A default link is NOT evidence that students were taught that material.
-- Revisions and retirement are recorded, never silently rewrite history.
CREATE TABLE public.chess_material_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  workplace_id uuid NOT NULL REFERENCES public.workplaces(id),
  group_id uuid REFERENCES public.class_groups(id),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 160),
  url text NOT NULL CHECK(length(url)<=500),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
  request_id uuid NOT NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id,request_id)
);
CREATE INDEX ccp_material_defaults_scope
 ON public.chess_material_defaults(teacher_id,workplace_id,group_id,archived_at);
ALTER TABLE public.chess_material_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_material_defaults_teacher ON public.chess_material_defaults
 FOR ALL TO authenticated
 USING(teacher_id=auth.uid()) WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.chess_material_defaults FROM anon,PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.chess_material_defaults TO authenticated;

CREATE TABLE public.chess_material_default_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  default_id uuid NOT NULL REFERENCES public.chess_material_defaults(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('created','updated','archived')),
  before_value jsonb,
  after_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ccp_material_default_history_scope
 ON public.chess_material_default_history(teacher_id,default_id,created_at DESC);
ALTER TABLE public.chess_material_default_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_material_default_history_teacher ON public.chess_material_default_history
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
REVOKE ALL ON public.chess_material_default_history FROM anon,PUBLIC;
GRANT SELECT ON public.chess_material_default_history TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_chess_material_default_validate()
 RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.teacher_id,NEW.workplace_id,NEW.group_id,NEW.request_id,NEW.created_at)
     IS DISTINCT FROM
      (OLD.id,OLD.teacher_id,OLD.workplace_id,OLD.group_id,OLD.request_id,OLD.created_at)
   THEN RAISE EXCEPTION 'DEFAULT_SCOPE_IMMUTABLE' USING ERRCODE='23514';END IF;
   IF OLD.archived_at IS NOT NULL THEN
     RAISE EXCEPTION 'DEFAULT_ALREADY_ARCHIVED' USING ERRCODE='23514';
   END IF;
   NEW.updated_at:=clock_timestamp();
 END IF;
 IF NEW.url !~ '^https://lichess[.]org/study/[A-Za-z0-9]{8}(/[A-Za-z0-9]{8})?/?$' THEN
   RAISE EXCEPTION 'INVALID_STUDY_URL' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.workplaces WHERE id=NEW.workplace_id
   AND teacher_id=NEW.teacher_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'DEFAULT_WORKPLACE_NOT_FOUND'
   USING ERRCODE='42501';END IF;
 IF NEW.group_id IS NOT NULL THEN
   PERFORM 1 FROM public.class_groups WHERE id=NEW.group_id
     AND workplace_id=NEW.workplace_id AND teacher_id=NEW.teacher_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEFAULT_GROUP_WORKPLACE_MISMATCH'
     USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_default_validate
 BEFORE INSERT OR UPDATE ON public.chess_material_defaults
 FOR EACH ROW EXECUTE FUNCTION public.ccp_chess_material_default_validate();

CREATE OR REPLACE FUNCTION public.ccp_chess_material_default_audit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action text;
BEGIN
 IF TG_OP='INSERT' THEN
   v_action:='created';
 ELSE
   IF (OLD.label,OLD.url,OLD.notes,OLD.archived_at)
      IS NOT DISTINCT FROM (NEW.label,NEW.url,NEW.notes,NEW.archived_at) THEN
     RETURN NEW;
   END IF;
   v_action:=CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'updated' END;
 END IF;
 INSERT INTO public.chess_material_default_history
   (teacher_id,default_id,action,before_value,after_value)
 VALUES(NEW.teacher_id,NEW.id,v_action,
   CASE WHEN TG_OP='INSERT' THEN NULL
     ELSE jsonb_build_object('label',OLD.label,'url',OLD.url,'notes',OLD.notes,
       'archivedAt',OLD.archived_at) END,
   jsonb_build_object('label',NEW.label,'url',NEW.url,'notes',NEW.notes,
     'archivedAt',NEW.archived_at));
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_material_default_audit
 AFTER INSERT OR UPDATE ON public.chess_material_defaults
 FOR EACH ROW EXECUTE FUNCTION public.ccp_chess_material_default_audit();
