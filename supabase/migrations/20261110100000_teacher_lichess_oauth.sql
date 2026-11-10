-- Teacher-owned Lichess OAuth credentials are never selectable by browser or MCP
-- PostgreSQL roles; only authenticated server handlers use the service client.
-- The token is AES-256-GCM ciphertext, not an access token/plaintext.
CREATE TABLE IF NOT EXISTS public.teacher_lichess_connections (
  teacher_id uuid PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  lichess_username text NOT NULL CHECK (char_length(lichess_username) BETWEEN 1 AND 100),
  scopes text[] NOT NULL CHECK (
    array_length(scopes,1) BETWEEN 1 AND 2 AND
    scopes <@ ARRAY['study:read','study:write']::text[] AND
    'study:read'=ANY(scopes)
  ),
  token_ciphertext text NOT NULL CHECK (left(token_ciphertext,7)='enc.v1.'),
  token_sha256 text NOT NULL CHECK (length(token_sha256)=64),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  previous_revoke_failed boolean NOT NULL DEFAULT false
);
ALTER TABLE public.teacher_lichess_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_lichess_connections FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.teacher_lichess_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('connected','reconnected','disconnected')),
  lichess_username text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  provider_revoked boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccp_lichess_events_teacher_time
  ON public.teacher_lichess_connection_events(teacher_id,created_at DESC);
ALTER TABLE public.teacher_lichess_connection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.teacher_lichess_connection_events FROM PUBLIC,anon,authenticated;
