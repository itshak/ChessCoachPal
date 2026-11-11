-- Durable at-most-once external invitation/reminder send attempt per event,
-- family, mode and reviewed message. No contact addresses or portal secrets
-- are persisted in receipts. A provider timeout is ambiguous: manual review
-- is required rather than automatically sending a duplicate.
CREATE TABLE public.event_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK(mode IN ('invite','reminder')),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'attempted'
    CHECK(status IN ('attempted','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(teacher_id,event_id,guardian_id,mode,content_hash)
);
CREATE INDEX ccp_event_email_deliveries_event
  ON public.event_email_deliveries(teacher_id,event_id);

ALTER TABLE public.event_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_event_email_deliveries_teacher ON public.event_email_deliveries
  FOR ALL TO authenticated
  USING (teacher_id=auth.uid())
  WITH CHECK (
    teacher_id=auth.uid()
    AND EXISTS(SELECT 1 FROM public.events e
      WHERE e.id=event_id AND e.teacher_id=auth.uid())
    AND EXISTS(SELECT 1 FROM public.guardians g
      WHERE g.id=guardian_id AND g.teacher_id=auth.uid())
  );
REVOKE ALL ON public.event_email_deliveries FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.event_email_deliveries TO authenticated;
