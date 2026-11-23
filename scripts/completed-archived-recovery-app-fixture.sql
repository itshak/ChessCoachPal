-- Privileged setup for a disposable CI/integration unit only.
-- It uses a new synthetic Auth identity so other specs never share the
-- teacher's calendar, enrollment, earlier archive timestamp or quota state.
-- Archive timestamp transforms here are fixture values, never a product backdating action.
BEGIN;
CREATE TEMP TABLE completed_fixture(ids jsonb);
DO $fixture$
DECLARE tid uuid:=gen_random_uuid(); zone text;vz text;
 v_now timestamptz:=date_trunc('minute',clock_timestamp()); t timestamptz;
 email_ text:='completed-proof-'||replace(tid::text,'-','')||'@example.invalid';
 pass_ text:='Synthetic-'||gen_random_uuid()::text;
 w uuid;returning_ uuid;active_ uuid;today date;
BEGIN
 SELECT teacher_zone,venue_zone INTO zone,vz FROM (VALUES
  ('UTC','Etc/GMT-1'),('Etc/GMT-8','Etc/GMT-9'),('Etc/GMT+8','Etc/GMT+7')
 ) zones(teacher_zone,venue_zone)
 WHERE extract(hour FROM v_now AT TIME ZONE teacher_zone) BETWEEN 8 AND 20 LIMIT 1;
 IF zone IS NULL THEN RAISE EXCEPTION 'fixture current calendar unavailable';END IF;
 today:=(v_now AT TIME ZONE zone)::date;
 t:=v_now-interval '4 hours';
 INSERT INTO auth.users(id,instance_id,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,aud,role,created_at,updated_at,
  confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,
  phone,phone_change,phone_change_token,reauthentication_token)
 VALUES(tid,'00000000-0000-0000-0000-000000000000',email_,extensions.crypt(pass_,extensions.gen_salt('bf')),
  v_now,'{"provider":"email","providers":["email"]}','{"display_name":"Completed recovery fixture"}',
  'authenticated','authenticated',v_now,v_now,'','','','','',NULL,'','','');
 INSERT INTO auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 VALUES(tid,tid,tid::text,jsonb_build_object('sub',tid,'email',email_),'email',v_now,v_now,v_now);
 INSERT INTO public.teachers(id,email,display_name,preferred_locale,onboarding_tour_completed_at)
 VALUES(tid,email_,'Completed recovery fixture','en',v_now);
 INSERT INTO public.teacher_settings(teacher_id,timezone) VALUES(tid,zone)
 ON CONFLICT(teacher_id) DO UPDATE SET timezone=excluded.timezone;
 INSERT INTO public.workplaces(teacher_id,name,timezone,currency,locale)
 VALUES(tid,'Disposable signed completed archive proof',vz,'USD','en') RETURNING id INTO w;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Signed archived student') RETURNING id INTO returning_;
 INSERT INTO public.students(teacher_id,name) VALUES(tid,'Signed active student') RETURNING id INTO active_;
 INSERT INTO public.workplace_enrollments(teacher_id,workplace_id,student_id,starts_on,ends_on)
 VALUES(tid,w,returning_,today-10,today-1),(tid,w,active_,today-10,NULL);
 UPDATE public.students SET archived_at=v_now-interval '6 hours' WHERE id=returning_;
 INSERT INTO completed_fixture VALUES(jsonb_build_object('workplaceId',w,'studentIds',ARRAY[returning_,active_],
  'studentNames',ARRAY['Signed archived student','Signed active student'],'email',email_,'password',pass_,
  'startsAt',t,'localStart',to_char(t AT TIME ZONE vz,'YYYY-MM-DD"T"HH24:MI')));
END;
$fixture$;
SELECT ids FROM completed_fixture;
COMMIT;
