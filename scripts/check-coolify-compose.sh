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
assert services["app"]["environment"]["BETA_GOTRUE_SIGNUP_DISABLED"] == services["auth"]["environment"]["GOTRUE_DISABLE_SIGNUP"], "Private beta signup guard must track actual GoTrue public signup setting"
assert services["auth"]["environment"]["GOTRUE_MAILER_AUTOCONFIRM"] == "false", "Email auto-confirm unsafe"
assert services["app"]["environment"]["BETA_GOTRUE_EMAIL_AUTOCONFIRM"] == services["auth"]["environment"]["GOTRUE_MAILER_AUTOCONFIRM"], "App beta email safety flag must mirror GoTrue"
assert not services["app"].get("env_file"), "App must not load repository-local secrets"
for name in ("db", "gateway", "migrate"):
    assert services[name].get("build"), f"{name} must bundle Git assets into its image"
for name, service in services.items():
    for mount in service.get("volumes", []):
        if isinstance(mount,dict):
            assert not str(mount.get("source","")).startswith("./"), f"{name}: relative host bind mount"
        elif isinstance(mount,str):
            assert not mount.startswith("."), f"{name}: relative host bind mount"
assert services["db"]["image"] == services["migrate"]["image"]
assert services["gateway"]["image"] == "chesscoachpal-staging-gateway:1.30.6", "Wrong packaged Nginx gateway image"
# The final canonical baseline cannot share pre-beta persistence.
expected_mounts = {
    "db": {
        "/var/lib/postgresql/data": "beta-v020-db-data",
        "/etc/postgresql-custom": "beta-v020-db-config",
    },
    "storage": {"/var/lib/storage": "beta-v020-storage-data"},
}
required_volumes = {source for mounts in expected_mounts.values() for source in mounts.values()}
assert set(data["volumes"]) == required_volumes, "Expected only the three isolated beta volumes"
for source in required_volumes:
    assert data["volumes"][source]["name"] == f"ccp-preflight_{source}", (
        f"{source} would alias a different Docker volume"
    )
for name, expected in expected_mounts.items():
    mounts = services[name].get("volumes", [])
    assert len(mounts) == len(expected) and all(mount["type"] == "volume" for mount in mounts), (
        f"{name} must mount only the expected managed volumes"
    )
    assert {mount["target"]: mount["source"] for mount in mounts} == expected, (
        f"{name} would miss or reuse a persistence mount"
    )
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
