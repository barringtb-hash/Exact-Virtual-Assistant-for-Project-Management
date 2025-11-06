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
npx --yes wait-on --timeout 60000 "tcp:${PORT}"

echo "==> Run Cypress"
XVFB=""
if command -v xvfb-run >/dev/null 2>&1; then
  XVFB="xvfb-run -a"
fi

CYPRESS_CFG="${CYPRESS_CFG:-cypress.config.ts}"

set +e
$XVFB npx --yes cypress run --config-file "$CYPRESS_CFG"
E2E_EXIT=$?
set -e

exit $E2E_EXIT
