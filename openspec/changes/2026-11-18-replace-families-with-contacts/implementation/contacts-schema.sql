-- Proposed additive staging schema. NOT an executable Supabase migration until
-- the coordinated portal, invoice and API cutover is implemented and tested.
-- Never deploy this independently.
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('person','organization')),
  email text,
  phone text,
  preferred_locale text CHECK (preferred_locale IN ('en','he','ru')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teacher_id,id)
);
CREATE INDEX contacts_teacher_name_idx ON public.contacts(teacher_id,display_name);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_teacher ON public.contacts FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE TABLE public.student_contacts (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  relationship_label text NOT NULL DEFAULT 'other' CHECK (length(btrim(relationship_label)) > 0),
  is_legal_guardian boolean NOT NULL DEFAULT false,
  may_receive_messages boolean NOT NULL DEFAULT false,
  emergency_priority integer CHECK (emergency_priority > 0),
  active_from date NOT NULL DEFAULT CURRENT_DATE,
  active_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id,contact_id),
  FOREIGN KEY (teacher_id,contact_id) REFERENCES public.contacts(teacher_id,id) ON DELETE RESTRICT,
  CONSTRAINT student_contacts_date_order CHECK (active_to IS NULL OR active_to >= active_from)
);
-- Composite student ownership is enforced by a tenant-qualified FK, not just RLS.
ALTER TABLE public.students ADD CONSTRAINT students_teacher_id_id_unique UNIQUE(teacher_id,id);
ALTER TABLE public.student_contacts ADD CONSTRAINT student_contacts_student_owner_fk
  FOREIGN KEY (teacher_id,student_id) REFERENCES public.students(teacher_id,id) ON DELETE CASCADE;
CREATE INDEX student_contacts_teacher_contact_idx ON public.student_contacts(teacher_id,contact_id);
ALTER TABLE public.student_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_contacts_teacher ON public.student_contacts FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  account_kind text NOT NULL CHECK (account_kind IN ('person','organization')),
  contact_id uuid,
  organization_details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(organization_details) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id,id),
  FOREIGN KEY (teacher_id,contact_id) REFERENCES public.contacts(teacher_id,id) ON DELETE RESTRICT
);
CREATE INDEX billing_accounts_teacher_idx ON public.billing_accounts(teacher_id);
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_accounts_teacher ON public.billing_accounts FOR ALL TO authenticated
  USING (teacher_id = (SELECT auth.uid()))
  WITH CHECK (teacher_id = (SELECT auth.uid()));
-- Historical guardian-to-contact mapping must be deterministic, auditable and
-- created before dropping guardian references. Staging is owner-qualified.
CREATE TABLE public.guardian_contact_transition (
  guardian_id uuid PRIMARY KEY REFERENCES public.guardians(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  primary_contact_id uuid NOT NULL,
  secondary_contact_id uuid,
  billing_account_id uuid NOT NULL,
  reviewed_at timestamptz,
  FOREIGN KEY (teacher_id,primary_contact_id) REFERENCES public.contacts(teacher_id,id),
  FOREIGN KEY (teacher_id,secondary_contact_id) REFERENCES public.contacts(teacher_id,id),
  FOREIGN KEY (teacher_id,billing_account_id) REFERENCES public.billing_accounts(teacher_id,id),
  CHECK (secondary_contact_id IS DISTINCT FROM primary_contact_id)
);
ALTER TABLE public.guardian_contact_transition ENABLE ROW LEVEL SECURITY;
-- Internal transition provenance must not be exposed to the teacher UI or MCP.
REVOKE ALL ON public.guardian_contact_transition FROM anon, authenticated;
