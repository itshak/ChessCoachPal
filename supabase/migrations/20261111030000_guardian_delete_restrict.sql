-- Family deletion is safe only while no student or invoice references it.
-- A concurrent student reassignment cannot evade the preflight preview:
-- PostgreSQL's FK KEY SHARE locks serialize against the guardian row DELETE.
-- Privileged service-role tenant erasure remains an explicit separate flow.
CREATE OR REPLACE FUNCTION public.ccp_guardian_delete_restrict()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user='authenticated' THEN
   IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.teacher_id THEN
     RAISE EXCEPTION 'GUARDIAN_NOT_FOUND' USING ERRCODE='42501';
   END IF;
   IF EXISTS(SELECT 1 FROM public.students s
     WHERE s.guardian_id=OLD.id)
     OR EXISTS(SELECT 1 FROM public.invoices i
       WHERE i.guardian_id=OLD.id) THEN
     RAISE EXCEPTION 'GUARDIAN_HAS_LINKED_HISTORY' USING ERRCODE='23503';
   END IF;
 END IF;
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_guardian_delete_restrict()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_guardian_delete_restrict ON public.guardians;
CREATE TRIGGER ccp_guardian_delete_restrict
 BEFORE DELETE ON public.guardians
 FOR EACH ROW EXECUTE FUNCTION public.ccp_guardian_delete_restrict();
