---
name: Server-tenant API key rotation
description: How to rotate the nordic-data-mcp server-tenant NORDIC_API_KEY without causing a production outage, and how to verify keys without leaking them.
---

# Rotating the server-tenant NORDIC_API_KEY

The server-tenant key (the key the MCP itself uses for the public, unauthenticated path) lives in **two independent places** that must BOTH be updated before the old key is revoked:

1. **Replit secret `NORDIC_API_KEY`** — used only by local smoke tests (`scripts/smoke-test.mjs`).
2. **Railway env var `NORDIC_API_KEY`** — used by the deployed public `/mcp` endpoint that real users hit.

(Martin's local Claude Desktop / stdio uses his *personal customer* key, NOT the server-tenant key — don't touch it during a server-key rotation.)

**Why:** Revoking the old key while Railway still holds it = every production `/mcp` call starts returning `[401] unauthorized`. A green local smoke test does NOT prove production is safe.

**How to apply — correct order, never skip a step:**
1. New key into Replit secret → run `node scripts/smoke-test.mjs` → expect `ALL CHECKS PASSED`.
2. New key into Railway Variables → Railway auto-redeploys.
3. Verify the *deployed* endpoint with a real `tools/call` (not just `/healthz`, and not just `initialize` — those don't exercise the backend key). Do the full Streamable-HTTP flow against `https://nordic-data-mcp-production.up.railway.app/mcp`: POST initialize (capture `Mcp-Session-Id` response header) → POST notifications/initialized → POST tools/call `lookup_company {country:"no", id:"923609016"}` → assert `EQUINOR` in the result text.
4. ONLY THEN tell the backend agent to revoke the old key.

## Verifying a key value without leaking it

Never paste key values in chat. To confirm which key is actually loaded vs. which the backend expects, compare SHA256 fingerprints (first 8 hex chars):

```
printf '%s' "$NORDIC_API_KEY" | shasum -a 256 | cut -c1-8
```

Both sides compute this on their copy; matching fingerprints = same key, differing = mismatch. This is how we caught that the Replit secret still held the dead **dev** key while the new **prod** key never landed — same fingerprint as the burned dev key proved it, with zero key exposure.

**Lesson:** a 401 with provably-correct header (`X-API-Key`) and provably-correct URL means the remaining variable is the key *value* — fingerprint it before assuming anything else is wrong. Dev keys only exist in the dev DB and 401 against all prod backends.
