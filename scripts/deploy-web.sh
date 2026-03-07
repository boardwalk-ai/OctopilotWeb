#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/octopilot-web}"
BRANCH="${DEPLOY_BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-octopilot-web}"

echo "[deploy] app dir: ${APP_DIR}"
echo "[deploy] branch: ${BRANCH}"

cd "${APP_DIR}"

if [[ ! -f package.json ]]; then
  echo "[deploy] package.json not found in ${APP_DIR}" >&2
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo "[deploy] .env.production is missing in ${APP_DIR}" >&2
  exit 1
fi

git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

npm ci
npm run build

systemctl restart "${SERVICE_NAME}"
systemctl is-active --quiet "${SERVICE_NAME}"

echo "[deploy] ${SERVICE_NAME} restarted successfully"
