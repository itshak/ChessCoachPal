-- A prepaid package expiry change must never invalidate a lesson that already
-- consumed one of its credits. The package UPDATE row lock serializes with
-- enforce_credit_redemption_rules(), which locks the same package FOR UPDATE
-- before adding any new redemption. Protects direct SQL and both UI/MCP paths.
CREATE OR REPLACE FUNCTION public.ccp_protect_credit_expiry_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.expires_on IS NOT DISTINCT FROM OLD.expires_on THEN
    RETURN NEW;
  END IF;
  IF NEW.expires_on IS NOT NULL AND (
    NEW.expires_on < NEW.starts_on OR EXISTS (
      SELECT 1 FROM public.credit_redemptions r
      JOIN public.lessons l ON l.id=r.lesson_id
      WHERE r.package_id=OLD.id AND l.lesson_date>NEW.expires_on
    )
  ) THEN
    RAISE EXCEPTION 'CREDIT_EXPIRY_HISTORY_CONFLICT'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ccp_credit_expiry_history_guard ON public.credit_packages;
CREATE TRIGGER ccp_credit_expiry_history_guard
  BEFORE UPDATE OF expires_on ON public.credit_packages
  FOR EACH ROW EXECUTE FUNCTION public.ccp_protect_credit_expiry_history();
