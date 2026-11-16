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
# The candidate-release job may still have its browser-test Next server on port
# 3000. Use 3100 for this independent Compose installation; production
# operators retain the documented default APP_PORT=3000.
sed -i -e 's|^APP_PORT=3000$|APP_PORT=3100|' \
       -e 's|^APP_URL=http://localhost:3000$|APP_URL=http://localhost:3100|' .env.local
docker compose -f docker-compose.example.yml --env-file .env.local config --quiet
echo "==> start isolated current-schema Docker Compose website/Supabase stack"
docker compose -f docker-compose.example.yml --env-file .env.local up -d --build app
echo "==> verify actual server and gateway"
ok=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 3 http://127.0.0.1:3100/icon/chesscoachpal.svg >/dev/null 2>&1 &&
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

# Exercise private beta on the SAME isolated synthetic Compose installation.
# Disabling direct GoTrue signup must not break valid invite-code registration.
echo "==> switch isolated stack to invite-only beta mode (public GoTrue signup disabled)"
sed -i \
  -e 's|^NEXT_PUBLIC_BETA_ONLY=.*|NEXT_PUBLIC_BETA_ONLY=true|' \
  -e 's|^BETA_ACCESS_CODE=.*|BETA_ACCESS_CODE=synthetic-beta-code-ci-only|' \
  -e 's|^DISABLE_SIGNUP=.*|DISABLE_SIGNUP=true|' .env.local
docker compose -f docker-compose.example.yml --env-file .env.local \
  up -d --force-recreate auth
docker compose -f docker-compose.example.yml --env-file .env.local \
  up -d --build app

for i in $(seq 1 40); do
  if curl -fsS --max-time 5 http://127.0.0.1:3100/icon/chesscoachpal.svg >/dev/null 2>&1 &&
     curl -fsS --max-time 5 http://127.0.0.1:8000/auth/v1/settings \
       | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{if(JSON.parse(s).disable_signup!==true)process.exit(1)})'; then
    break
  fi
  if [[ "$i" == 40 ]]; then echo "Private beta mode failed to start" >&2; exit 1; fi
  sleep 5
done

# This is the direct public Auth endpoint; no invite code is involved. It MUST
# not create an account, and GoTrue itself must report signup disabled.
status="$(curl --silent --show-error -o "$scratch/bypass.json" -w '%{http_code}' \
  -X POST 'http://127.0.0.1:8000/auth/v1/signup' \
  -H "apikey: $anon" -H 'Content-Type: application/json' \
  -d '{"email":"m5-beta-bypass@example.invalid","password":"Synthetic-Direct-Bypass-123!"}')"
[[ "$status" =~ ^4[0-9][0-9]$ ]] || { echo "Direct GoTrue signup was NOT blocked: HTTP $status" >&2; exit 1; }

auth_db_count() {
  docker compose -f docker-compose.example.yml --env-file .env.local \
    exec -T db psql -U postgres -d postgres -Atc "$1"
}
[[ "$(auth_db_count "select count(*) from auth.users where email='m5-beta-bypass@example.invalid'")" == "0" ]] || {
  echo "A direct signup created an unauthorized Auth user" >&2; exit 1;
}

# GoTrue OTP has a create-user option; the global disable-signup setting
# must close this second public path rather than only /auth/v1/signup.
status="$(curl --silent --show-error -o "$scratch/otp-bypass.json" -w '%{http_code}' \
  -X POST 'http://127.0.0.1:8000/auth/v1/otp' \
  -H "apikey: $anon" -H 'Content-Type: application/json' \
  -d '{"email":"m5-beta-otp-bypass@example.invalid","create_user":true}')"
[[ "$status" =~ ^4[0-9][0-9]$ ]] || { echo "Direct GoTrue OTP signup was NOT blocked: HTTP $status" >&2; exit 1; }
[[ "$(auth_db_count "select count(*) from auth.users where email='m5-beta-otp-bypass@example.invalid'")" == "0" ]] || {
  echo "A direct OTP signup created an unauthorized Auth user" >&2; exit 1;
}

status="$(curl --silent --show-error -o "$scratch/no-code.json" -w '%{http_code}' \
  -X POST 'http://127.0.0.1:3100/api/auth/signup' \
  -H 'Content-Type: application/json' \
  -d '{"email":"m5-beta-no-code@example.invalid","password":"Synthetic-No-Code-123!"}')"
[[ "$status" == "403" ]] || { echo "Website failed to reject missing beta code: $status" >&2; exit 1; }
[[ "$(auth_db_count "select count(*) from auth.users where email='m5-beta-no-code@example.invalid'")" == "0" ]] || {
  echo "Missing code created an Auth user" >&2; exit 1;
}

status="$(curl --silent --show-error -o "$scratch/valid-beta.json" -w '%{http_code}' \
  -X POST 'http://127.0.0.1:3100/api/auth/signup' \
  -H 'Content-Type: application/json' \
  -d '{"email":"m5-beta-code@example.invalid","password":"Synthetic-Valid-Code-123!","displayName":"Synthetic Beta Teacher","accessCode":"synthetic-beta-code-ci-only","timezone":"UTC"}')"
[[ "$status" == "200" ]] || {
  echo "Valid beta registration failed: HTTP $status" >&2;
  node -e 'const fs=require("fs");let d=JSON.parse(fs.readFileSync(process.argv[1]));console.error(d.error||"no error detail")' "$scratch/valid-beta.json";
  exit 1;
}
node -e 'const fs=require("fs");let d=JSON.parse(fs.readFileSync(process.argv[1]));if(d.ok!==true||d.needsConfirmation)process.exit(1)' "$scratch/valid-beta.json"
[[ "$(auth_db_count "select count(*) from auth.users where email='m5-beta-code@example.invalid'")" == "1" ]] || {
  echo "Valid invite-code signup did not persist exactly one identity" >&2; exit 1;
}
[[ "$(auth_db_count "select count(*) from public.teachers where email='m5-beta-code@example.invalid'")" == "1" ]] || {
  echo "Valid invite-code signup did not persist exactly one teacher" >&2; exit 1;
}

status="$(curl --silent --show-error -o "$scratch/waitlist.json" -w '%{http_code}' \
  -X POST 'http://127.0.0.1:3100/api/auth/waitlist' \
  -H 'Content-Type: application/json' \
  -d '{"email":"m5-beta-waitlist@example.invalid"}')"
[[ "$status" == "200" ]] || { echo "Beta waitlist failed: HTTP $status" >&2; exit 1; }
[[ "$(auth_db_count "select count(*) from public.waitlist where email='m5-beta-waitlist@example.invalid'")" == "1" ]] || {
  echo "Beta waitlist did not persist" >&2; exit 1;
}
echo "BETA_SIGNUP_SECURITY_OK: direct Auth blocked; missing code rejected; invite code provisioned teacher; waitlist persisted"
