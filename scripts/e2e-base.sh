#!/usr/bin/env bash
set -Eeuo pipefail

PORT="${PORT:-5173}"

cleanup() {
  if [[ -n "${PREVIEW_PID:-}" ]] && ps -p "$PREVIEW_PID" > /dev/null 2>&1; then
    kill "$PREVIEW_PID" || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Build"
npm run build

echo "==> Clear port ${PORT} if in use"
npx --yes kill-port "${PORT}" || true
if lsof -ti tcp:"${PORT}" >/dev/null 2>&1; then
  lsof -ti tcp:"${PORT}" | xargs -r kill -9 || true
fi

echo "==> Start vite preview on :${PORT}"
npx vite preview --port "${PORT}" --strictPort --host &
PREVIEW_PID=$!

echo "==> Wait for server to be ready"
npx --yes wait-on --timeout 60000 "http://127.0.0.1:${PORT}"

echo "==> Run Cypress"
CYPRESS_CFG="${CYPRESS_CFG:-cypress.config.ts}"

XVFB_PREFIX=""
if command -v xvfb-run >/dev/null 2>&1; then
  XVFB_PREFIX="xvfb-run -a"
elif [ "${CI:-false}" = "true" ]; then
  echo "Error: Xvfb is not installed but CI=true. Run scripts/install-cypress-deps.sh first." >&2
  exit 1
else
  echo "Warning: Xvfb is not installed; running Cypress without it (local/dev only)." >&2
fi

if [ -n "${CYPRESS_SPEC:-}" ]; then
  $XVFB_PREFIX npx --yes cypress run --config-file "${CYPRESS_CFG}" --spec "${CYPRESS_SPEC}"
else
  $XVFB_PREFIX npx --yes cypress run --config-file "${CYPRESS_CFG}"
fi
