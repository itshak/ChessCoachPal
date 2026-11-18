-- Only CI synthetic data. This file must NEVER be applied to a deployed DB.
-- The existing local seed creates teacher, guardians, pupils and private lesson.
UPDATE public.students SET archived_at='2026-11-01T00:00:00Z'
 WHERE id='10000000-0000-0000-0000-000000000005';
INSERT INTO public.workplaces(teacher_id,name,timezone,currency)
 VALUES('00000000-0000-0000-0000-000000000001','Synthetic second workplace','UTC','USD');
INSERT INTO public.class_groups(teacher_id,workplace_id,name)
 SELECT teacher_id,id,'Synthetic second group' FROM public.workplaces
 WHERE name='Synthetic second workplace';
INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id)
 SELECT teacher_id,id,'10000000-0000-0000-0000-000000000002' FROM public.workplaces
 WHERE name='Synthetic second workplace';
INSERT INTO public.group_enrollments(teacher_id,workplace_id,group_id,student_id)
 SELECT teacher_id,workplace_id,id,'10000000-0000-0000-0000-000000000002'
 FROM public.class_groups WHERE name='Synthetic second group';
INSERT INTO public.invoices(id,teacher_id,guardian_id,period_start,period_end,status,subtotal_cents)
 VALUES('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
        '50000000-0000-0000-0000-000000000001','2026-10-01','2026-10-31','draft',6000);
INSERT INTO public.invoice_items(invoice_id,student_id,description,quantity,unit_cents,amount_cents)
 VALUES('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        'Synthetic chess lesson',1,6000,6000);
INSERT INTO public.credit_packages(teacher_id,student_id,invoice_id,credits,duration_minutes,price_cents,starts_on)
 VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000001',2,30,6000,'2026-10-01');
INSERT INTO public.events(id,teacher_id,title,starts_at)
 VALUES('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
        'Synthetic group tournament','2027-04-01T13:00:00Z');
INSERT INTO public.event_students(event_id,student_id)
 VALUES('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO public.event_rsvps(event_id,guardian_id,status)
 VALUES('90000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','pending');
INSERT INTO public.student_rating_snapshots
 (teacher_id,student_id,provider,time_control,rating,source,observed_at,request_id)
 VALUES('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        'lichess','rapid',1220,'teacher_manual','2026-10-10T00:00:00Z',
        'b0000000-0000-0000-0000-000000000001');
