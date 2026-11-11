-- Durable coach-attested chess goals, rating snapshots and profile
-- corrections. Website and MCP both use the same student update service;
-- this database trigger captures history even for otherwise direct RLS writes.
ALTER TABLE public.students
 ADD COLUMN IF NOT EXISTS chess_goals text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS chess_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.students
 ADD CONSTRAINT ccp_student_chess_goals_length CHECK(length(chess_goals)<=5000),
 ADD CONSTRAINT ccp_student_chess_ratings_map CHECK(jsonb_typeof(chess_ratings)='object');

CREATE TABLE public.student_chess_profile_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 teacher_id uuid NOT NULL REFERENCES public.teachers(id),
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
 field_name text NOT NULL CHECK(field_name IN (
   'strength','chess_goals','lichess_username','chesscom_username',
   'lichess_rating','chesscom_rating','chess_ratings'
 )),
 previous_value jsonb,
 next_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ccp_chess_profile_history_student
 ON public.student_chess_profile_history(teacher_id,student_id,created_at DESC,id DESC);
ALTER TABLE public.student_chess_profile_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccp_chess_profile_history_owner ON public.student_chess_profile_history
 FOR SELECT TO authenticated USING(teacher_id=auth.uid());
REVOKE ALL ON public.student_chess_profile_history FROM anon,PUBLIC;
GRANT SELECT ON public.student_chess_profile_history TO authenticated;

CREATE OR REPLACE FUNCTION public.ccp_student_chess_history_capture()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.teacher_id<>OLD.teacher_id THEN
   RAISE EXCEPTION 'STUDENT_OWNER_CANNOT_CHANGE' USING ERRCODE='42501';
 END IF;
 IF NEW.strength IS DISTINCT FROM OLD.strength THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'strength',to_jsonb(OLD.strength),to_jsonb(NEW.strength));
 END IF;
 IF NEW.chess_goals IS DISTINCT FROM OLD.chess_goals THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chess_goals',to_jsonb(OLD.chess_goals),to_jsonb(NEW.chess_goals));
 END IF;
 IF NEW.lichess_username IS DISTINCT FROM OLD.lichess_username THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'lichess_username',to_jsonb(OLD.lichess_username),to_jsonb(NEW.lichess_username));
 END IF;
 IF NEW.chesscom_username IS DISTINCT FROM OLD.chesscom_username THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chesscom_username',to_jsonb(OLD.chesscom_username),to_jsonb(NEW.chesscom_username));
 END IF;
 IF NEW.lichess_rating IS DISTINCT FROM OLD.lichess_rating THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'lichess_rating',to_jsonb(OLD.lichess_rating),to_jsonb(NEW.lichess_rating));
 END IF;
 IF NEW.chesscom_rating IS DISTINCT FROM OLD.chesscom_rating THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chesscom_rating',to_jsonb(OLD.chesscom_rating),to_jsonb(NEW.chesscom_rating));
 END IF;
 IF NEW.chess_ratings IS DISTINCT FROM OLD.chess_ratings THEN
   INSERT INTO public.student_chess_profile_history
    (teacher_id,student_id,field_name,previous_value,next_value)
   VALUES(NEW.teacher_id,NEW.id,'chess_ratings',OLD.chess_ratings,NEW.chess_ratings);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ccp_student_chess_history
 AFTER UPDATE OF strength,chess_goals,chess_ratings,lichess_username,
  chesscom_username,lichess_rating,chesscom_rating ON public.students
 FOR EACH ROW EXECUTE FUNCTION public.ccp_student_chess_history_capture();
