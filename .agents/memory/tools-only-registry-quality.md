---
name: Tools-only MCP servers still need empty resources/prompts handlers
description: Why a tools-only MCP server should implement empty resources/list and prompts/list and declare those capabilities.
---

# Implement empty `resources/list` and `prompts/list` even on a tools-only server

Even when an MCP server exposes only tools (no resources, no prompts), declare
the `resources` and `prompts` capabilities and register list handlers that
return empty arrays (`{ resources: [] }`, `{ prompts: [] }`).

**Why:** registries/inspectors (Smithery in particular) probe `resources/list`
and `prompts/list` during discovery. If the server has no handler, the MCP SDK
replies `-32601 Method not found`, which surfaces as a warning AND lowers the
Smithery "Quality Score" (it grades MCP best-practice coverage + metadata).
Returning empty arrays is spec-compliant, removes the warnings, and raises the
score. This is purely cosmetic for real clients (Claude/Cursor work either way)
but matters for directory ranking.

**How to apply:** add the handlers in *both* transports (stdio `src/index.ts`
and HTTP `src/http.ts` `buildServer()`), set
`capabilities: { tools: {}, resources: {}, prompts: {} }`, and make sure the
HTTP keyless-discovery allowlist (`UNAUTH_METHODS`) already contains
`resources/list` and `prompts/list` so the discovery boundary stays consistent.
Shipped in 1.5.1.
