#!/usr/bin/env bash
# Isolated Traefik 3.6/Redis portal privacy and cross-replica throttle proof.
# No production endpoint, real bearer, separately shared network or secret.
set -euo pipefail
test "${1:-}" = --disposable-only || { echo "Use --disposable-only"; exit 2; }
umask 077
p=ccpportalproxy$(date +%s%N)
[[ "$p" =~ ^ccpportalproxy[0-9]{18,22}$ ]]
work=$(mktemp -d /var/tmp/ccp-portal-proxy.XXXXXXXX)
chmod 755 "$work"
dc(){ docker compose -p "$p" -f "$work/compose.yml" "$@"; }
finish(){
 result=$?
 if test -f "$work/compose.yml"; then dc down --remove-orphans > /dev/null 2>&1 || true; fi
 if test "$result" -ne 0; then echo "Isolated ingress proof failed; rehearsal files at $work"; else rm -r "$work"; fi
}
trap finish EXIT
cat > "$work/route.yml" <<'YAML'
http:
  routers:
    portal:
      entryPoints: [http]
      rule: 'PathPrefix(`/portal/`) || PathPrefix(`/api/portal/`)'
      service: synthetic
      middlewares: [portal-budget]
      observability:
        accessLogs: false
        metrics: false
        tracing: false
    loggedControl:
      entryPoints: [http]
      rule: 'PathPrefix(`/`)'
      service: synthetic
  middlewares:
    portal-budget:
      rateLimit:
        average: 1
        period: 2m
        burst: 1
        redis:
          endpoints: ["redis:6379"]
  services:
    synthetic:
      loadBalancer:
        servers: [{url: "http://echo:80"}]
YAML
cat > "$work/nginx.conf" <<'NGINX'
server {
  listen 80;
  # The disposable control proves the proxy log instead of the app log.
  access_log off;
  location / { default_type text/plain; return 200 "portal mock\n"; }
}
NGINX
cat > "$work/compose.yml" <<'YAML'
services:
  redis:
    image: redis:7.2
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 1s
      retries: 10
  echo:
    image: nginx:1.30.6-alpine
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
  ingress-one: &ingress
    image: traefik:v3.6
    command: ["--entrypoints.http.address=:8080", "--providers.file.filename=/route.yml", "--accesslog=true", "--accesslog.format=json"]
    depends_on:
      redis: {condition: service_healthy}
      echo: {condition: service_started}
    volumes:
      - ./route.yml:/route.yml:ro
  ingress-two: *ingress
  client:
    image: alpine:3.20
    command: ["sleep", "180"]
networks:
  default:
    internal: true
YAML
chmod 644 "$work/route.yml" "$work/nginx.conf"
dc up -d --pull never > "$work/up.log" 2>&1
test "$(docker network inspect -f '{{.Internal}}' "${p}_default")" = true
for service in redis echo ingress-one ingress-two client; do
 id=$(dc ps -q "$service")
 [[ "$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$id")" =~ ^(\{\}|null)$ ]]
done
response(){
 dc exec -T client sh -c 'wget -T 4 -S -O /dev/null "$1" 2>&1 || true' sh "$1"
}
status(){ response "$1" | sed -nE 's/.*HTTP\/[0-9.]+ ([0-9]{3}).*/\1/p' | tail -1; }
for proxy in ingress-one ingress-two; do
 code=""
 for i in $(seq 1 15); do
  code=$(status "http://$proxy:8080/logged-control-$p")
  test "$code" != 200 || break
  sleep 1
 done
 test "$code" = 200
done
secret=synthetic-portal-routing-marker-$p
test "$(status "http://ingress-one:8080/portal/$secret")" = 200
test "$(status "http://ingress-two:8080/api/portal/$secret/calendar")" = 429
# Exercise the unaffected general router again as a positive control.
test "$(status "http://ingress-two:8080/logged-control-$p")" = 200
dc logs --no-color ingress-one ingress-two > "$work/ingress.log"
grep -Fq "/logged-control-$p" "$work/ingress.log"
if grep -Fq "$secret" "$work/ingress.log"; then
 echo "Synthetic portal marker unexpectedly appeared in proxy log"; exit 1
fi
echo "PASS: page/API share one Redis rate limit across both isolated proxy instances."
echo "PASS: ordinary control paths are logged, but neither portal path is logged."
