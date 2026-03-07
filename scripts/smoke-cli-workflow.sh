#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-4173}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY_URL="http://127.0.0.1:${PORT}/r"
CORE_DIR="${ROOT_DIR}/.workflow/ui8kit-core"
APP_DIR="${ROOT_DIR}/.workflow/vite-app"
REGISTRY_OUTPUT="${ROOT_DIR}/.workflow/registry/r"
REGISTRY_DIR="${ROOT_DIR}/.workflow/registry"
SERVER_LOG="${ROOT_DIR}/.tmp/ui8kit-registry-server.log"

mkdir -p "${ROOT_DIR}/.tmp"

log_step() {
  echo "==> $1"
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found in PATH"
  exit 1
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    log_step "Stopping local registry server..."
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log_step "Installing dependencies (if needed)"
npm install

log_step "Building CLI"
npm run build

log_step "Scanning registry source"
node dist/index.js --cwd "${CORE_DIR}" scan --source src --output src/registry.json

log_step "Rebuilding local registry artifacts"
rm -rf "${REGISTRY_OUTPUT}"
mkdir -p "${ROOT_DIR}/.workflow/registry"
node dist/index.js --cwd "${CORE_DIR}" build src/registry.json --output ../registry/r

log_step "Starting local registry server on port ${PORT}"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "${PORT}" --directory "${REGISTRY_DIR}" >"${SERVER_LOG}" 2>&1 &
elif command -v python >/dev/null 2>&1; then
  python -m http.server "${PORT}" --directory "${REGISTRY_DIR}" >"${SERVER_LOG}" 2>&1 &
else
  echo "Python not found, unable to start registry server"
  exit 1
fi
SERVER_PID=$!
sleep 1

log_step "Running init against local registry"
node dist/index.js --cwd "${APP_DIR}" init --yes --registry-url "${REGISTRY_URL}" --strict-cdn

log_step "Installing all components"
node dist/index.js --cwd "${APP_DIR}" add --all --registry-url "${REGISTRY_URL}" --strict-cdn --registry ui

log_step "Running smoke checks"
node dist/index.js --cwd "${APP_DIR}" info --json
node dist/index.js --cwd "${APP_DIR}" list --json --registry-url "${REGISTRY_URL}" --strict-cdn
node dist/index.js --cwd "${APP_DIR}" diff --json --registry-url "${REGISTRY_URL}" --strict-cdn
node dist/index.js --cwd "${APP_DIR}" add button --dry-run --registry-url "${REGISTRY_URL}" --strict-cdn
node scripts/get-cdn.js --url "${REGISTRY_URL}" --path components/variants/index.json

log_step "Cleaning cache and resetting app state"
node dist/index.js --cwd "${APP_DIR}" cache clear
node dist/index.js --cwd "${APP_DIR}" reset --yes

log_step "Smoke workflow completed"
