#!/usr/bin/env bash
# Smoke test for the HTTP transport. Boots the server on a random port,
# runs 4 assertions, then kills the server. Exits non-zero on any failure.
#
# Usage:
#   NORDIC_API_KEY=ndk_... ./scripts/smoke-test-http.sh
set -euo pipefail

if [ -z "${NORDIC_API_KEY:-}" ]; then
  echo "NORDIC_API_KEY not set — cannot smoke-test the /mcp public endpoint."
  exit 1
fi

PORT="${PORT:-4900}"
LOG="$(mktemp)"
trap 'pkill -f "dist/http.js" 2>/dev/null || true; rm -f "$LOG"' EXIT

npm run build >/dev/null
NORDIC_API_KEY="$NORDIC_API_KEY" PORT="$PORT" node dist/http.js >"$LOG" 2>&1 &
sleep 2

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; echo "--- server log ---"; cat "$LOG"; exit 1; }

echo "T1: /healthz"
HEALTH=$(curl -fsS "http://localhost:$PORT/healthz")
echo "$HEALTH" | grep -q '"status":"ok"' && pass "healthz returns ok" || fail "healthz"

# NOTE: `initialize`/`tools/list` are intentionally servable without auth on
# /mcp/auth (UNAUTH_METHODS discovery-probe exemption in src/http.ts) so MCP
# discovery clients can read tool metadata before the user supplies a key.
# The real auth boundary is `tools/call` — the only path that hits the upstream
# API and consumes quota — so that is what we assert here.
echo "T2: /mcp/auth tools/call without Authorization → 401"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/mcp/auth" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lookup_company","arguments":{"country":"dk","id":"22756214"}}}')
[ "$CODE" = "401" ] && pass "no-auth tools/call rejected with 401" || fail "expected 401, got $CODE"

echo "T3: /mcp/auth tools/call with malformed token → 401"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/mcp/auth" \
  -H "Authorization: Bearer wrong-shape" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lookup_company","arguments":{"country":"dk","id":"22756214"}}}')
[ "$CODE" = "401" ] && pass "malformed token tools/call rejected" || fail "expected 401, got $CODE"

echo "T4: /mcp public initialize works"
RESP=$(curl -fsS -X POST "http://localhost:$PORT/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}')
echo "$RESP" | grep -q '"protocolVersion"' && pass "public /mcp initializes" || fail "public /mcp"

# NOTE: tools/list and tools/call over the Streamable HTTP transport require the
# Mcp-Session-Id returned by `initialize`, so they are not curl-friendly one-liners.
# The discovery tools (list_endpoints / get_endpoint_schema / call_endpoint) and the
# full tool registry are verified end-to-end over stdio by scripts/smoke-test.mjs.

echo ""
echo "All smoke tests passed ✓"
