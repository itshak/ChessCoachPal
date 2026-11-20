-- CHESSCOACHPAL SYNTHETIC DEVELOPMENT FIXTURES ONLY.
-- Never deploy/reset a real tenant with this seed. Known test credentials only.
-- Test account is intentionally unprivileged, demo-only, and LOCAL.
-- Credentials match e2e/helpers/auth.ts.
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone, phone_change, phone_change_token,
  reauthentication_token
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'teacher@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Chess Coach"}',
  'authenticated', 'authenticated', now(), now(),
  '', '', '', '', '', '', '', '', ''
);
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"teacher@example.com"}',
  'email', now(), now(), now()
);

-- The teacher trigger creates default workplace + chess skill categories.
INSERT INTO public.teachers (id, email, display_name, hosted_plan, onboarding_tour_completed_at) VALUES
('00000000-0000-0000-0000-000000000001', 'teacher@example.com', 'Chess Coach', 'pro', now());

-- Synthetic identities, distinct from payer accounts and portal grants.
-- No capability tokens are stored or issued from seed contacts.
INSERT INTO public.contacts(id,teacher_id,display_name,email) VALUES
('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Jordan Parent','jordan.parent@example.com'),
('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Sam Guardian','sam.guardian@example.com'),
('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Noah Adult','noah.adult@example.com'),
('50000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Alex Parent','alex.parent@example.com');

INSERT INTO public.billing_accounts(id,teacher_id,display_name,account_kind,contact_id) VALUES
('b0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000001','Chen household','person','50000000-0000-0000-0000-000000000001'),
('b0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000001','Sam Rivera','person','50000000-0000-0000-0000-000000000002'),
('b0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001','Noah Adult','person','50000000-0000-0000-0000-000000000003');

INSERT INTO public.students (id, teacher_id, name, parent_contact,
  birthdate, level, practice_start_date, teacher_notes, default_rate_cents) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Emma', 'emma.parent@example.com',
 (CURRENT_DATE - interval '9 years')::date, 'Beginner',
 date_trunc('year', CURRENT_DATE - interval '2 years')::date,
 'Tactics: forks; introduce simple checkmate patterns.', NULL),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Liam', 'liam.parent@example.com',
 (CURRENT_DATE - interval '7 years')::date, 'Beginner',
 date_trunc('year', CURRENT_DATE - interval '1 year')::date,
 'Practice piece safety and board vision.', NULL),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'Sophia', NULL,
 (CURRENT_DATE - interval '11 years')::date, 'Intermediate', NULL,
 'King and pawn endgames.', 5000),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'Noah', 'noah.adult@example.com',
 (CURRENT_DATE - interval '34 years')::date, 'Adult beginner',
 (CURRENT_DATE - interval '6 months')::date,
 'Review legal moves and basic tactics.', 6000),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Maya', NULL, NULL, 'Intermediate', NULL, 'Develop calculation habits.', NULL);

INSERT INTO public.student_contacts(
 teacher_id,student_id,contact_id,relationship_label,is_legal_guardian,may_receive_messages
) VALUES
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','parent',true,true),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','parent',true,true),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','parent',true,true),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004','parent',true,true),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000002','parent',true,true),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000003','self',false,true);

INSERT INTO public.teacher_settings (
  teacher_id, business_name, timezone, cancellation_window_hours, lesson_duration_options,
  default_rate_cents, rate_basis, currency, invoice_cadence,
  payment_instructions, payment_provider, business_website, business_contact, business_info,
  timely_cancel_earns_makeup, teacher_cancel_earns_makeup
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Synthetic Chess Coaching', 'America/Chicago', 24, '{30,45,60}',
  4500, 'per_hour', 'USD', 'monthly',
  'Demo only. No actual payments.', 'manual',
  'https://example.com/chess-coach', 'Demo only',
  'Chess coaching for students of all levels. Sessions and student information are synthetic.',
  true, true
);

INSERT INTO public.lesson_slots (
  id, teacher_id, student_id, day_of_week, start_time, duration_minutes, start_date, rate_cents
) VALUES
('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2,'16:00',30,CURRENT_DATE - 14,NULL),
('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',2,'16:30',30,CURRENT_DATE - 14,NULL),
('60000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003',4,'17:00',45,CURRENT_DATE - 14,5000),
('60000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004',3,'18:00',45,CURRENT_DATE - 14,6000);

-- Synthetic students belong to the teacher's initial private-coaching
-- workplace. Canonical private sessions validate frozen roster and enrollment.
-- Explicitly date synthetic-only membership before its synthetic completed lesson.
-- Never infer the start of historical membership from that lesson in real data.
INSERT INTO public.workplace_enrollments (teacher_id,workplace_id,student_id,starts_on,source)
SELECT s.teacher_id,w.id,s.id,(CURRENT_DATE - interval '30 days')::date,'reimport'
FROM public.students s
JOIN LATERAL (
 SELECT id FROM public.workplaces w
 WHERE w.teacher_id=s.teacher_id ORDER BY w.created_at,w.id LIMIT 1
) w ON true
WHERE s.teacher_id='00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- Explicit workplace/date-specific billing contracts, never inferred from
-- contacts. The fifth learner has intentionally no payer.
-- Synthetic payer history starts at the explicit synthetic enrollment date.
-- Never invent an earlier contract than the verified enrollment evidence.
INSERT INTO public.student_billing_assignments(
  teacher_id,student_id,workplace_id,billing_account_id,effective_from
)
SELECT e.teacher_id,e.student_id,e.workplace_id,
  CASE e.student_id
    WHEN '10000000-0000-0000-0000-000000000001' THEN 'b0000000-0000-4000-8000-000000000001'::uuid
    WHEN '10000000-0000-0000-0000-000000000002' THEN 'b0000000-0000-4000-8000-000000000001'::uuid
    WHEN '10000000-0000-0000-0000-000000000003' THEN 'b0000000-0000-4000-8000-000000000002'::uuid
    WHEN '10000000-0000-0000-0000-000000000004' THEN 'b0000000-0000-4000-8000-000000000003'::uuid
  END,e.starts_on
FROM public.workplace_enrollments e
WHERE e.teacher_id='00000000-0000-0000-0000-000000000001'
  AND e.student_id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004');

-- The one synthetic completed private lesson exists ONLY as a canonical
-- teaching_session; the INSERT trigger freezes its student participant.
INSERT INTO public.teaching_sessions (
 id,teacher_id,workplace_id,student_id,title,
 slot_id,slot_occurrence_date,starts_at,duration_minutes,
 local_timezone,status,is_home_visit,slot_rate_cents
) SELECT
 '70000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000001',w.id,
 '10000000-0000-0000-0000-000000000001','Private chess lesson',
 '60000000-0000-0000-0000-000000000001',
 (date_trunc('week',current_date)::date - 6),
 ((date_trunc('week',current_date)::date - 6)+time '16:00')
   AT TIME ZONE 'America/Chicago',
 30,'America/Chicago','completed',false,NULL
 FROM public.workplaces w
 WHERE w.teacher_id='00000000-0000-0000-0000-000000000001'
 ORDER BY w.created_at,w.id LIMIT 1;
INSERT INTO public.session_attendance (
 teacher_id,session_id,student_id,status,marked_at,updated_at
) VALUES(
 '00000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000001','present',now(),now()
);
INSERT INTO public.session_notes (
 teacher_id,session_id,student_id,body,private_body,shared_with_contacts
) VALUES (
 '00000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000001',
 'Emma spotted a fork and practiced king-and-pawn endings.',
 'Next: introduce queen-and-rook checkmate.',true
);

INSERT INTO public.skill_dimensions (id, teacher_id, name, sort_order) VALUES
('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tactics',0),
('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Calculation',1),
('a1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Endgames',2),
('a1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Strategy',3);
INSERT INTO public.skill_assessments (dimension_id, student_id, rating, note, assessed_on) VALUES
('a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,'Spots forks',CURRENT_DATE - 7),
('a1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',2,'Needs more forcing move calculation',CURRENT_DATE - 7);
