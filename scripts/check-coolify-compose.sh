#!/usr/bin/env bash
# Purely static check: uses dummy interpolation values and does not start Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
cat >"$tmp_dir/dummy.env" <<'ENV'
APP_URL=https://beta.example.invalid
SUPABASE_PUBLIC_URL=https://supabase-beta.example.invalid
SUPABASE_HOST_ALIAS=supabase-beta.example.invalid
POSTGRES_PASSWORD=nonsecret_preflight
JWT_SECRET=nonsecret_preflight
ANON_KEY=nonsecret_anon_preflight
SERVICE_ROLE_KEY=nonsecret_service_preflight
S3_PROTOCOL_ACCESS_KEY_ID=nonsecret_s3_id_preflight
S3_PROTOCOL_ACCESS_KEY_SECRET=nonsecret_s3_secret_preflight
TOKEN_ENCRYPTION_KEY=nonsecret_token_preflight
MCP_SESSION_ENCRYPTION_KEY=nonsecret_session_preflight
ENV
docker compose --project-name ccp-preflight --env-file "$tmp_dir/dummy.env" \
  --file docker-compose.coolify.yml config --format json >"$tmp_dir/normalized.json"
python3 - "$tmp_dir/normalized.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
services = data["services"]
required = {"app", "gateway", "db", "auth", "rest", "storage", "migrate"}
assert required <= set(services), "Required runtime service missing"
assert set(services) == required, "Unexpected default runtime service"
for name, service in services.items():
    assert not service.get("ports"), f"{name} publishes host ports"
    networks = set(service.get("networks", []))
    assert "default" in networks, f"{name} missing private network"
    assert ("coolify" in networks) == (name in {"app", "gateway"}), (
        f"{name} unexpected shared proxy-network membership"
    )
assert services["auth"]["environment"]["GOTRUE_DISABLE_SIGNUP"] == "true", "Signup must start closed"
assert services["auth"]["environment"]["GOTRUE_MAILER_AUTOCONFIRM"] == "false", "Email auto-confirm unsafe"
assert not services["app"].get("env_file"), "App must not load repository-local secrets"
assert set(("db-data", "db-config", "storage-data")) <= set(data["volumes"]), "Missing persistence volumes"
assert services["app"]["build"]["args"]["NEXT_PUBLIC_SUPABASE_URL"] == (
    "https://supabase-beta.example.invalid"
)
assert services["app"]["environment"]["MCP_PUBLIC_ORIGIN"] == "https://beta.example.invalid"
assert services["app"]["build"]["args"]["NEXT_PUBLIC_BETA_ONLY"] == "false"
assert services["app"]["environment"]["NEXT_PUBLIC_BETA_ONLY"] == "false"
assert services["app"]["environment"]["TOKEN_ENCRYPTION_KEY"], "Token encryption secret missing"
assert services["app"]["environment"]["MCP_SESSION_ENCRYPTION_KEY"], "Delegated session key missing"
print("COOLIFY_COMPOSE_PREFLIGHT_OK: 7 default services, 0 host ports, isolated private DB, "
      "signup closed, persistent volumes, required app build/runtime variables")
PY
docker compose --project-name ccp-preflight --profile cron \
  --env-file "$tmp_dir/dummy.env" --file docker-compose.coolify.yml config --quiet
