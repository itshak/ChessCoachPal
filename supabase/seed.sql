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
  crypt('password123', gen_salt('bf')),
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

INSERT INTO public.guardians (id, teacher_id, name, family_name, email, portal_token,
  secondary_name, secondary_email, email_recipients) VALUES
('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Jordan Parent', 'Chen', 'jordan.parent@example.com', 'dev-portal-jordan',
 'Alex Parent', 'alex.parent@example.com', 'both'),
('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Sam Guardian', 'Rivera', 'sam.guardian@example.com', 'dev-portal-sam', NULL, NULL, 'primary'),
('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'Noah Adult', 'Noah Adult', 'noah.adult@example.com', 'dev-portal-noah', NULL, NULL, 'primary');

INSERT INTO public.students (id, teacher_id, name, parent_contact, guardian_id,
  birthdate, level, practice_start_date, teacher_notes, default_rate_cents) VALUES
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Emma', 'emma.parent@example.com', '50000000-0000-0000-0000-000000000001',
 (CURRENT_DATE - interval '9 years')::date, 'Beginner',
 date_trunc('year', CURRENT_DATE - interval '2 years')::date,
 'Tactics: forks; introduce simple checkmate patterns.', NULL),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Liam', 'liam.parent@example.com', '50000000-0000-0000-0000-000000000001',
 (CURRENT_DATE - interval '7 years')::date, 'Beginner',
 date_trunc('year', CURRENT_DATE - interval '1 year')::date,
 'Practice piece safety and board vision.', NULL),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'Sophia', NULL, '50000000-0000-0000-0000-000000000002',
 (CURRENT_DATE - interval '11 years')::date, 'Intermediate', NULL,
 'King and pawn endgames.', 5000),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'Noah', 'noah.adult@example.com', '50000000-0000-0000-0000-000000000003',
 (CURRENT_DATE - interval '34 years')::date, 'Adult beginner', (CURRENT_DATE - interval '6 months')::date,
 'Review legal moves and basic tactics.', 6000),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Maya', NULL, NULL, NULL, 'Intermediate', NULL, 'Develop calculation habits.', NULL);

INSERT INTO public.studio_policies (
  teacher_id, studio_name, timezone, cancellation_window_hours, lesson_duration_options,
  default_rate_cents, rate_basis, currency, invoice_cadence,
  payment_instructions, payment_provider, studio_website, studio_contact, studio_info,
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

INSERT INTO public.lessons (
  id, teacher_id, student_id, slot_id, lesson_date, starts_at, duration_minutes
) VALUES (
  '70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
  CURRENT_DATE - 7,
  ((CURRENT_DATE - 7) + time '16:00') AT TIME ZONE 'America/Chicago',30
);
INSERT INTO public.attendance (id, lesson_id, status) VALUES
('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','attended');
INSERT INTO public.lesson_notes (lesson_id, body, private_body, shared_with_parent) VALUES (
  '70000000-0000-0000-0000-000000000001',
  'Emma spotted a fork and practiced king-and-pawn endings.',
  'Next: introduce queen-and-rook checkmate.', true
);

INSERT INTO public.skill_dimensions (id, teacher_id, name, sort_order) VALUES
('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tactics',0),
('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Calculation',1),
('a1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Endgames',2),
('a1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Strategy',3);
INSERT INTO public.skill_assessments (dimension_id, student_id, rating, note, assessed_on) VALUES
('a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',3,'Spots forks',CURRENT_DATE - 7),
('a1000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',2,'Needs more forcing move calculation',CURRENT_DATE - 7);
