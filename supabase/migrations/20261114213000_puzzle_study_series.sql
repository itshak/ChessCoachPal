-- Private Puzzles, Puzzles 2, ... remote study creation receipts. An
-- attempted remote write is NEVER retried automatically after a timeout.
CREATE TABLE IF NOT EXISTS public.lichess_puzzle_series (
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 suffix integer NOT NULL CHECK(suffix BETWEEN 1 AND 1000000),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 50),
 study_id text CHECK(study_id IS NULL OR study_id ~ '^[A-Za-z0-9]{8}$'),
 state text NOT NULL CHECK(state IN ('attempted','created','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 PRIMARY KEY(teacher_id,request_id),
 UNIQUE(teacher_id,suffix),
 CONSTRAINT ccp_puzzle_series_receipt_state CHECK (
  (state='created' AND study_id IS NOT NULL AND confirmed_at IS NOT NULL) OR
  (state<>'created' AND study_id IS NULL AND confirmed_at IS NULL))
);
CREATE INDEX ccp_puzzle_series_recent ON public.lichess_puzzle_series
 (teacher_id,created_at DESC);
ALTER TABLE public.lichess_puzzle_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ccp_puzzle_series_owner ON public.lichess_puzzle_series;
CREATE POLICY ccp_puzzle_series_owner ON public.lichess_puzzle_series
 FOR ALL TO authenticated USING(teacher_id=auth.uid())
 WITH CHECK(teacher_id=auth.uid());
REVOKE ALL ON public.lichess_puzzle_series FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lichess_puzzle_series TO authenticated;
-- Only the server after a validated provider response may finalize a receipt.
GRANT ALL ON public.lichess_puzzle_series TO service_role;
CREATE OR REPLACE FUNCTION public.ccp_puzzle_series_claim(
 p_suffix integer,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $puzzle_claim$
DECLARE
 v_teacher uuid:=auth.uid();
 v_name text;v_prior public.lichess_puzzle_series%ROWTYPE;
BEGIN
 IF v_teacher IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_suffix NOT BETWEEN 1 AND 1000000 THEN
  RAISE EXCEPTION 'INVALID_SERIES' USING ERRCODE='22023';END IF;
 v_name:=CASE WHEN p_suffix=1 THEN 'Puzzles' ELSE 'Puzzles '||p_suffix END;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_teacher::text,0));
 SELECT * INTO v_prior FROM public.lichess_puzzle_series
  WHERE teacher_id=v_teacher AND request_id=p_request_id;
 IF FOUND THEN
   IF v_prior.suffix<>p_suffix THEN
    RAISE EXCEPTION 'SERIES_REPLAY_CONFLICT' USING ERRCODE='23505';END IF;
   RETURN jsonb_build_object('name',v_prior.name,'suffix',v_prior.suffix,
    'studyId',v_prior.study_id,'state',v_prior.state,'replayed',true);
 END IF;
 IF(SELECT count(*) FROM public.lichess_puzzle_series
    WHERE teacher_id=v_teacher AND
      created_at>clock_timestamp()-interval '24 hours' AND state<>'failed')>=30
 THEN RAISE EXCEPTION 'SERIES_DAILY_LIMIT' USING ERRCODE='23514';END IF;
 INSERT INTO public.lichess_puzzle_series(teacher_id,request_id,suffix,name,state)
  VALUES(v_teacher,p_request_id,p_suffix,v_name,'attempted');
 RETURN jsonb_build_object('name',v_name,'suffix',p_suffix,
  'studyId',NULL,'state','attempted','replayed',false);
END;
$puzzle_claim$;
REVOKE ALL ON FUNCTION public.ccp_puzzle_series_claim(integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ccp_puzzle_series_claim(integer,uuid) TO authenticated;
