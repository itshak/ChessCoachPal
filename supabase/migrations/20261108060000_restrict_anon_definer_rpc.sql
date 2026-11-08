-- Harden inherited default grants before exposing the v0.x OAuth/MCP
-- service on a public HTTPS demo domain. The canonical fresh-install schema
-- grants future function EXECUTE directly to anon; revoking only from PUBLIC
-- is insufficient. Authenticated teacher-scoped agent calls remain supported.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION
  public.agent_record_attendance(uuid,uuid,text,text,timestamptz,uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION
  public.agent_update_session_note(uuid,text,timestamptz,uuid)
  FROM PUBLIC, anon;
-- This function runs exclusively as a trigger and is not a public API.
REVOKE EXECUTE ON FUNCTION
  public.chesscoachpal_snapshot_participants()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.agent_record_attendance(uuid,uuid,text,text,timestamptz,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.agent_update_session_note(uuid,text,timestamptz,uuid)
  TO authenticated;

DO $privileges$
DECLARE
  func regprocedure;
BEGIN
  FOREACH func IN ARRAY ARRAY[
    'public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)'::regprocedure,
    'public.agent_record_attendance(uuid,uuid,text,text,timestamptz,uuid)'::regprocedure,
    'public.agent_update_session_note(uuid,text,timestamptz,uuid)'::regprocedure,
    'public.chesscoachpal_snapshot_participants()'::regprocedure
  ] LOOP
    IF has_function_privilege('anon',func,'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous EXECUTE must be revoked on %',func;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated',
       'public.agent_coaching_mutate(text,jsonb,timestamptz,uuid,text)'::regprocedure,
       'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated coaching mutations must remain permitted';
  END IF;
END;
$privileges$;
