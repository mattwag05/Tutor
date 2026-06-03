#!/usr/bin/env bash
set -euo pipefail

# Deploy Tutor on Pironman from a published Docker image.
#
# Defaults target the production tailnet host. Override with:
#   TUTOR_IMAGE=ghcr.io/mattwag05/tutor:sha-abcdef12 scripts/deploy_pironman.sh
#
# If GHCR is unavailable or private, opt into the remote local-build fallback:
#   TUTOR_ALLOW_LOCAL_BUILD_FALLBACK=1 scripts/deploy_pironman.sh

HOST="${TUTOR_DEPLOY_HOST:-pironman}"
COMPOSE_DIR="${TUTOR_COMPOSE_DIR:-/home/matthewwagner/homelab/docker/compose/deeptutor}"
REMOTE_REPO_DIR="${TUTOR_REMOTE_REPO_DIR:-/home/matthewwagner/Projects/Tutor}"
SERVICE="${TUTOR_SERVICE:-deeptutor}"
IMAGE="${TUTOR_IMAGE:-ghcr.io/mattwag05/tutor:latest}"
OVERRIDE_FILE="${TUTOR_DEPLOY_OVERRIDE:-compose.tutor-image.yaml}"
COURSE_URL="${TUTOR_COURSE_URL:-https://tutor.tail6e035b.ts.net/course}"
STATUS_URL="${TUTOR_STATUS_URL:-https://tutor.tail6e035b.ts.net/api/v1/system/status}"
HEALTH_ATTEMPTS="${TUTOR_HEALTH_ATTEMPTS:-45}"
ALLOW_LOCAL_BUILD_FALLBACK="${TUTOR_ALLOW_LOCAL_BUILD_FALLBACK:-0}"
LOCAL_BUILD_IMAGE="${TUTOR_LOCAL_BUILD_IMAGE:-}"

remote_env=(
  "COMPOSE_DIR=$(printf '%q' "$COMPOSE_DIR")"
  "REMOTE_REPO_DIR=$(printf '%q' "$REMOTE_REPO_DIR")"
  "SERVICE=$(printf '%q' "$SERVICE")"
  "IMAGE=$(printf '%q' "$IMAGE")"
  "OVERRIDE_FILE=$(printf '%q' "$OVERRIDE_FILE")"
  "HEALTH_ATTEMPTS=$(printf '%q' "$HEALTH_ATTEMPTS")"
  "ALLOW_LOCAL_BUILD_FALLBACK=$(printf '%q' "$ALLOW_LOCAL_BUILD_FALLBACK")"
  "LOCAL_BUILD_IMAGE=$(printf '%q' "$LOCAL_BUILD_IMAGE")"
)

echo "Deploying ${IMAGE} to ${HOST}:${COMPOSE_DIR}"

ssh "$HOST" "${remote_env[*]} bash -s" <<'REMOTE'
set -euo pipefail

cd "$COMPOSE_DIR"

tmp_override="${OVERRIDE_FILE}.next"
trap 'rm -f "$tmp_override"' EXIT

cat > "$tmp_override" <<YAML
services:
  ${SERVICE}:
    image: ${IMAGE}
    pull_policy: always
YAML

echo "Validating compose config..."
docker compose -f compose.yaml -f "$tmp_override" config --quiet

echo "Pulling ${IMAGE}..."
if docker compose -f compose.yaml -f "$tmp_override" pull "$SERVICE"; then
  selected_image="$IMAGE"
  selected_pull_policy="always"
else
  if [ "$ALLOW_LOCAL_BUILD_FALLBACK" != "1" ]; then
    echo "Image pull failed and TUTOR_ALLOW_LOCAL_BUILD_FALLBACK is not enabled." >&2
    exit 1
  fi

  echo "Image pull failed; building from ${REMOTE_REPO_DIR} on this host..."
  cd "$REMOTE_REPO_DIR"

  if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing fallback build because ${REMOTE_REPO_DIR} has local changes." >&2
    git status --short
    exit 1
  fi

  git fetch origin main
  git checkout main
  git pull --ff-only origin main

  short_commit="$(git rev-parse --short HEAD)"
  selected_image="${LOCAL_BUILD_IMAGE:-tutor:${short_commit}}"
  selected_pull_policy="never"

  docker build \
    --target production \
    --build-arg BACKEND_PORT=8001 \
    --build-arg APP_VERSION="$short_commit" \
    -t "$selected_image" \
    .

  cd "$COMPOSE_DIR"
  cat > "$tmp_override" <<YAML
services:
  ${SERVICE}:
    image: ${selected_image}
    pull_policy: ${selected_pull_policy}
YAML
fi

mv "$tmp_override" "$OVERRIDE_FILE"

if [ -f compose.tutor-local.yaml ]; then
  mv compose.tutor-local.yaml compose.tutor-local.yaml.disabled
fi

echo "Starting ${SERVICE}..."
docker compose -f compose.yaml -f "$OVERRIDE_FILE" up -d "$SERVICE"

echo "Waiting for container health..."
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
  health="$(docker inspect "$SERVICE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  echo "health=${health}"
  if [ "$health" = "healthy" ] || [ "$health" = "running" ]; then
    break
  fi
  sleep 2
done

final_health="$(docker inspect "$SERVICE" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')"
if [ "$final_health" != "healthy" ] && [ "$final_health" != "running" ]; then
  docker compose -f compose.yaml -f "$OVERRIDE_FILE" ps
  docker logs "$SERVICE" --tail 120
  exit 1
fi

docker inspect "$SERVICE" --format 'image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} started={{.State.StartedAt}}'
REMOTE

echo "Checking public route..."
curl -k -fsSI "$COURSE_URL" >/dev/null
curl -k -fsS "$STATUS_URL" >/dev/null
echo "Deploy complete."
