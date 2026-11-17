-- Non-destructive rollout for existing Supabase installations; take tested backup first.
-- Never reset any database with real teacher data.
BEGIN;
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS preferred_locale text NOT NULL DEFAULT 'en';
ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_preferred_locale_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_preferred_locale_check CHECK (preferred_locale IN ('en','he','ru'));
COMMENT ON COLUMN public.teachers.preferred_locale IS
  'Teacher interface language, independent of workplace locale/timezone.';
-- Preserve least-privilege teacher field grants. Do not grant UPDATE on the entire table.
GRANT UPDATE(preferred_locale) ON TABLE public.teachers TO authenticated;
COMMIT;
