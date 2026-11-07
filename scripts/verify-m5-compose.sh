#!/usr/bin/env bash
# GitHub Actions only: bring up the actual Docker Compose fresh stack using
# generated synthetic credentials and no external accounts or private fixtures.
set -euo pipefail
umask 077
if [[ "$CI" != "true" || "$M5_SYNTHETIC_COMPOSE" != "1" ]]; then
  echo "Refusing non-synthetic Docker Compose test" >&2; exit 2
fi
scratch="$(mktemp -d)"
trap 'docker compose -f docker-compose.example.yml --env-file .env.local down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$scratch"; rm -f .env.local' EXIT
cp .env.example .env.local
bash docker/supabase/generate-secrets.sh > "$scratch/secrets"
while IFS='=' read -r name value; do
  case "$name" in
    POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)
      sed -i "s|^$name=.*|$name=$value|" .env.local
      ;;
  esac
done < "$scratch/secrets"
sed -i "s|^TOKEN_ENCRYPTION_KEY=.*|TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env.local
sed -i "s|^MCP_SESSION_ENCRYPTION_KEY=.*|MCP_SESSION_ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env.local
docker compose -f docker-compose.example.yml --env-file .env.local config --quiet
echo "==> start isolated current-schema Docker Compose website/Supabase stack"
docker compose -f docker-compose.example.yml --env-file .env.local up -d --build app
echo "==> verify actual server and gateway"
ok=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/icon/chesscoachpal.svg >/dev/null 2>&1 &&
     curl -fsS --max-time 3 http://127.0.0.1:8000/auth/v1/health >/dev/null 2>&1; then
    ok=1; break
  fi
  sleep 5
done
if [[ "$ok" != "1" ]]; then
  docker compose -f docker-compose.example.yml --env-file .env.local ps --all
  echo "Self-host stack failed to become healthy" >&2
  exit 1
fi
echo "==> verify email/password account creation with no AI subscription"
anon="$(sed -n 's/^ANON_KEY=//p' .env.local)"
response="$(curl --fail-with-body --silent --show-error -X POST \
  'http://127.0.0.1:8000/auth/v1/signup' \
  -H "apikey: $anon" -H 'Content-Type: application/json' \
  -d '{"email":"m5-compose-teacher@example.com","password":"synthetic-Only-Password-123!"}')"
RESPONSE="$response" node -e 'const r=JSON.parse(process.env.RESPONSE);if(!(r.id||r.user?.id))process.exit(1)'
echo "Fresh Compose web/gateway/auth/account onboarding passed with no external AI account."
