BEGIN;
-- BEGIN ChessCoachPal contact identity foundation (OpenSpec contacts 1A).
-- Contact relationship, legal authority, communication permission and payer
-- identity are separate. No portal grants are minted from these records.
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('person','organization')),
  email text CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 320),
  phone text CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 80),
  preferred_locale text CHECK (preferred_locale IS NULL OR preferred_locale IN ('en','he','ru')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  last_request_id uuid,
  last_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,teacher_id)
);
CREATE INDEX IF NOT EXISTS contacts_teacher_display_idx ON public.contacts(teacher_id,status,display_name,id);

CREATE TABLE IF NOT EXISTS public.student_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  relationship_label text NOT NULL CHECK (char_length(btrim(relationship_label)) BETWEEN 1 AND 80),
  is_legal_guardian boolean NOT NULL DEFAULT false,
  may_receive_messages boolean NOT NULL DEFAULT false,
  emergency_priority smallint CHECK (emergency_priority BETWEEN 1 AND 20),
  active_from date,
  active_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  last_request_id uuid,
  last_request_hash text,
  CHECK (active_from IS NULL OR active_to IS NULL OR active_to >= active_from),
  FOREIGN KEY (student_id,teacher_id) REFERENCES public.students(id,teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id,teacher_id) REFERENCES public.contacts(id,teacher_id) ON DELETE RESTRICT,
  UNIQUE (id,teacher_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS student_contacts_one_current_link
  ON public.student_contacts(teacher_id,student_id,contact_id) WHERE active_to IS NULL;
CREATE INDEX IF NOT EXISTS student_contacts_teacher_contact_idx
  ON public.student_contacts(teacher_id,contact_id,student_id);

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 160),
  account_kind text NOT NULL DEFAULT 'person' CHECK (account_kind IN ('person','organization')),
  contact_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  last_request_id uuid,
  last_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contact_id,teacher_id) REFERENCES public.contacts(id,teacher_id) ON DELETE RESTRICT,
  UNIQUE (id,teacher_id)
);
CREATE INDEX IF NOT EXISTS billing_accounts_teacher_name_idx
  ON public.billing_accounts(teacher_id,status,display_name,id);

-- During the incremental, reviewed transition, old issued invoices remain
-- unchanged and retain guardian_id; this extra FK preserves the future payer.
-- The final legacy-column removal is blocked until finance/portal cutover.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_account_id uuid;
DO $contacts_invoice_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid='public.invoices'::regclass
       AND conname='invoices_owned_billing_account_fk') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_owned_billing_account_fk
      FOREIGN KEY (billing_account_id,teacher_id)
      REFERENCES public.billing_accounts(id,teacher_id) ON DELETE RESTRICT;
  END IF;
END
$contacts_invoice_fk$;
CREATE INDEX IF NOT EXISTS invoices_teacher_billing_account_idx
  ON public.invoices(teacher_id,billing_account_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
DO $contacts_policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='contacts' AND policyname='contacts_teacher') THEN
    CREATE POLICY contacts_teacher ON public.contacts FOR ALL TO authenticated
      USING (teacher_id=(select auth.uid()))
      WITH CHECK (teacher_id=(select auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='student_contacts' AND policyname='student_contacts_teacher') THEN
    CREATE POLICY student_contacts_teacher ON public.student_contacts FOR ALL TO authenticated
      USING (teacher_id=(select auth.uid()))
      WITH CHECK (teacher_id=(select auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='billing_accounts' AND policyname='billing_accounts_teacher') THEN
    CREATE POLICY billing_accounts_teacher ON public.billing_accounts FOR ALL TO authenticated
      USING (teacher_id=(select auth.uid()))
      WITH CHECK (teacher_id=(select auth.uid()));
  END IF;
END
$contacts_policies$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.contacts,public.student_contacts,public.billing_accounts TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.contacts,public.student_contacts,public.billing_accounts TO service_role;
-- END ChessCoachPal contact identity foundation.

-- A reviewed, additive one-time mapping. Requires an independently verified
-- restore and private operator approval BEFORE any non-synthetic execution.
-- Legacy portal tokens, issued invoices and event RSVPs are never deleted or
-- silently broadened. All mapped IDs are deterministic for verification.
INSERT INTO public.contacts
 (id,teacher_id,display_name,kind,email,phone,preferred_locale,created_at)
SELECT g.id,g.teacher_id,btrim(g.name),'person',
       nullif(btrim(g.email),''),
       nullif(btrim(g.phone),''),
       g.preferred_locale,g.created_at
FROM public.guardians g
ON CONFLICT (id) DO NOTHING;

-- Secondary people are actual independent contact rows, not additional
-- legal guardians or additional portal audiences by default.
INSERT INTO public.contacts
 (id,teacher_id,display_name,kind,email,phone,preferred_locale,created_at)
SELECT md5('ccp-secondary:'||g.id::text)::uuid,g.teacher_id,
       coalesce(nullif(btrim(g.secondary_name),''), 'Unspecified secondary contact'),
       'person',nullif(btrim(g.secondary_email),''),
       nullif(btrim(g.secondary_phone),''),g.preferred_locale,g.created_at
FROM public.guardians g
WHERE nullif(btrim(g.secondary_name),'') IS NOT NULL
   OR nullif(btrim(g.secondary_email),'') IS NOT NULL
   OR nullif(btrim(g.secondary_phone),'') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_contacts
 (teacher_id,student_id,contact_id,relationship_label,
  is_legal_guardian,may_receive_messages)
SELECT s.teacher_id,s.id,g.id,'Existing primary contact',false,
       g.email_recipients IN ('primary','both') AND nullif(btrim(g.email),'') IS NOT NULL
FROM public.students s
JOIN public.guardians g ON g.id=s.guardian_id AND g.teacher_id=s.teacher_id
ON CONFLICT DO NOTHING;

INSERT INTO public.student_contacts
 (teacher_id,student_id,contact_id,relationship_label,
  is_legal_guardian,may_receive_messages)
SELECT s.teacher_id,s.id,md5('ccp-secondary:'||g.id::text)::uuid,
       'Existing secondary contact',false,
       g.email_recipients IN ('secondary','both') AND nullif(btrim(g.secondary_email),'') IS NOT NULL
FROM public.students s
JOIN public.guardians g ON g.id=s.guardian_id AND g.teacher_id=s.teacher_id
WHERE nullif(btrim(g.secondary_name),'') IS NOT NULL
   OR nullif(btrim(g.secondary_email),'') IS NOT NULL
   OR nullif(btrim(g.secondary_phone),'') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.billing_accounts
 (id,teacher_id,display_name,account_kind,contact_id,created_at)
SELECT g.id,g.teacher_id,
       coalesce(nullif(btrim(g.family_name),''),btrim(g.name)),
       'person',g.id,g.created_at
FROM public.guardians g
ON CONFLICT (id) DO NOTHING;

UPDATE public.invoices i SET billing_account_id=i.guardian_id
WHERE i.billing_account_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.billing_accounts b
    WHERE b.id=i.guardian_id AND b.teacher_id=i.teacher_id
  );

-- Fail closed on missing/incorrect mapping, and refuse a source record with
-- an empty primary name rather than quietly creating a fake identity.
DO $contacts_reconcile$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.guardians g
   LEFT JOIN public.contacts c ON c.id=g.id AND c.teacher_id=g.teacher_id
   WHERE c.id IS NULL
 ) OR EXISTS (
   SELECT 1 FROM public.students s
   WHERE s.guardian_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public.student_contacts sc
     WHERE sc.student_id=s.id AND sc.teacher_id=s.teacher_id
       AND sc.contact_id=s.guardian_id AND sc.active_to IS NULL
   )
 ) OR EXISTS (
   SELECT 1 FROM public.invoices i
   WHERE i.guardian_id IS NOT NULL
     AND (i.billing_account_id IS DISTINCT FROM i.guardian_id
       OR NOT EXISTS (
         SELECT 1 FROM public.billing_accounts b
         WHERE b.id=i.billing_account_id AND b.teacher_id=i.teacher_id
       ))
 ) THEN
    RAISE EXCEPTION 'CONTACT_RECONCILIATION_FAILED: blocked; inspect tenant-level mappings before retry';
 END IF;
END
$contacts_reconcile$;

COMMIT;
