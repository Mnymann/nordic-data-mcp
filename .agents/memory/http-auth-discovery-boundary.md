---
name: HTTP transport auth boundary
description: Why /mcp/auth serves some MCP methods without a key, and what the smoke test must actually assert.
---

# /mcp/auth intentionally exempts discovery methods from auth

`src/http.ts` defines `UNAUTH_METHODS` (`initialize`, `notifications/initialized`,
`ping`, `tools/list`, `resources/list`, `prompts/list`). On BOTH the public `/mcp`
and the Bearer `/mcp/auth` endpoints, a request whose JSON-RPC `method` is in that
set is served WITHOUT a key (`isDiscoveryProbe`). Only `tools/call` (and anything
not in the set) requires a valid `ndk_...` key on `/mcp/auth`.

**Why:** MCP discovery clients (Smithery's gateway scanner, MCP Inspector, registry
crawlers, Claude/ChatGPT connector pre-flight) must read tool metadata BEFORE the
end user has supplied an API key. If `tools/list` returned 401, Smithery's scan
fails and the listing shows no tool cards — which defeats discoverability. The
paying/quota calls all live in `tools/call`, which stays authenticated.

**How to apply:** When asserting the auth boundary (e.g. `scripts/smoke-test-http.sh`),
send a `tools/call` body to prove 401 on missing/garbage tokens. Do NOT assert that
`initialize` returns 401 — that contradicts the design and will fail. A smoke test
that expects `initialize` → 401 is stale, not a regression.
