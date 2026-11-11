-- Ordinary teacher edits must not destroy chess assessment history by FK cascade.
-- Service-role privacy/account erasure remains a separate, controlled operation.
CREATE OR REPLACE FUNCTION public.ccp_protect_skill_assessment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = OLD.teacher_id AND EXISTS (
    SELECT 1 FROM public.skill_assessments WHERE dimension_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Skill dimension has historical ratings; rename it instead'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.ccp_protect_skill_assessment_history() FROM PUBLIC;
DROP TRIGGER IF EXISTS ccp_protect_skill_assessment_history ON public.skill_dimensions;
CREATE TRIGGER ccp_protect_skill_assessment_history
BEFORE DELETE ON public.skill_dimensions
FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_skill_assessment_history();
