---
name: Remote MCP auth model (Nordic Data MCP)
description: Why a generic remote MCP client can't connect, and the deliberate API-key-not-OAuth design + its two HTTP endpoints.
---

The remote HTTP transport uses **static API-key auth, NOT OAuth** — by deliberate design. Two endpoints:
- **`/mcp`** — public, no key. Upstream calls billed to the SERVER's own `NORDIC_API_KEY` (freemium/discovery). Any client (even OAuth-only ones) connects here without hitting the OAuth trap, because there's no 401.
- **`/mcp/auth`** — requires `Authorization: Bearer ndk_...` (raw `ndk_...` also accepted for the Smithery gateway). Each call billed to the caller's own tenant + quota.

**The connection failure (resolved — decision: keep API-key auth, defer OAuth):** a generic MCP client handed only the `/mcp/auth` URL gets a 401, and per the MCP authorization spec falls back to OAuth Dynamic Client Registration at `POST /register` → 404, and never retries with a key. Verified live: the server advertises NO OAuth at all — no `WWW-Authenticate: Bearer` header, and `/.well-known/oauth-*` + `/openid-configuration` all 404. So the `/register` attempt is purely client-side default behavior, NOT something the server triggers.

**Why we don't "fix" it with code that makes OAuth-only clients connect:** that requires implementing real OAuth 2.1 (Phase 2). Decision: keep API-key auth; route clients to the right door via docs instead.
- **`WWW-Authenticate: Bearer` must NOT be sent on 401** — spec-compliant clients (incl. the Smithery gateway) read it as an OAuth challenge and hang in a sign-in popup. Plain 401 + JSON-RPC error is the correct signal.
- `/register` and OAuth `/.well-known/*` return a clear JSON **4xx** `oauth_not_supported` (never 200 — a 200 makes an OAuth client think registration succeeded and hang worse).

**Cost guardrail on the public `/mcp`:** because `/mcp` bills upstream to the shared server key, anonymous abuse is a direct cost vector (same risk family as the admin/dashboard exposure, but intentional). The backend per-key quota is the hard ceiling (returns 429 `quota_exceeded`); the MCP layer adds a per-IP rate limit (`PUBLIC_RATE_LIMIT`/`PUBLIC_RATE_WINDOW_MS`, `trust proxy=1` for real client IP behind Railway) as defense-in-depth. The "bound quota" itself lives on the backend — confirm the server key's tier there, not in this repo.

**How to apply:** build full OAuth 2.1 only when a real external self-onboarding customer actually needs it; until then, the answer to "a generic client can't connect" is documentation (public `/mcp` vs Bearer `/mcp/auth` vs npx stdio), not code.
