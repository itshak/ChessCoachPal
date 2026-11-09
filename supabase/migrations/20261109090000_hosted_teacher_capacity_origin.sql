-- New hosted teachers must inherit database-level capacity enforcement.
-- An inserted trial/paid preview row previously inherited hosted_enforced=false,
-- letting direct authenticated writes bypass eventual free active-student caps.
-- Self-hosted free teachers retain their unrestricted default (false).
CREATE OR REPLACE FUNCTION public.ccp_enforce_hosted_teacher_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.hosted_plan IN ('trial','pro','founding','gifted') THEN
    NEW.hosted_enforced:=true;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_enforce_hosted_teacher_origin()
  FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS ccp_enforce_hosted_teacher_origin ON public.teachers;
CREATE TRIGGER ccp_enforce_hosted_teacher_origin
BEFORE INSERT OR UPDATE OF hosted_plan,hosted_enforced
ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.ccp_enforce_hosted_teacher_origin();
