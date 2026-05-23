# Changelog

All notable changes to `nordic-data-mcp` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] — 2026-05-23

### Changed
- **`/mcp/auth` now accepts the API key in two header formats:** the canonical `Authorization: Bearer ndk_...` (used by Claude.ai, ChatGPT, our documentation) and the raw `Authorization: ndk_...` (sent by the Smithery.ai gateway, which does not support per-parameter value templates). The strict `ndk_[A-Za-z0-9_-]{16,}` format check is unchanged, so this widens transport compatibility without weakening authentication. Required for the Smithery.ai listing — their UI lets a server author choose `header` or `query`, but does not expose a "prefix" / "value template" field, so any registered header is sent with the raw user-supplied value.

## [1.3.0] — 2026-05-22

### Added
- **New `/mcp/auth` HTTP endpoint** — authenticated Streamable HTTP transport for paying customers. Requires `Authorization: Bearer ndk_...` header on every request; the provided key is forwarded upstream as `X-API-Key` so each customer is billed against their own tenant and daily quota. Designed for ChatGPT and Claude.ai web custom-connector users who cannot use the stdio transport.
- **`runWithApiKey()` helper in `apiClient`** — uses `AsyncLocalStorage` to scope a per-request API key to all upstream calls within a handler, without changing any tool signatures. Supports a `strict: true` mode used by `/mcp/auth` that is **fail-closed**: if the ALS context is lost between the request boundary and the upstream call, the request is rejected rather than silently falling back to the server-side env key. This prevents any scenario where a paying customer's session could be billed against the server tenant.
- **`isStrictApiKeyScopeActive()` assertion** — called by `/mcp/auth` immediately before dispatch as belt-and-suspenders confirmation that ALS context propagated.
- **`ensureApiKeyConfigured()` helper** — called at stdio startup to fail fast if `NORDIC_API_KEY` is not set in the environment.

### Changed
- **`/mcp` endpoint is unchanged** — still no-auth, still uses server-side `NORDIC_API_KEY`. Intended for the Anthropic Connectors Directory listing and freemium discovery. Sessions are now tracked in a separate map from `/mcp/auth`.
- **Friendly error messages for quota and auth failures.** Upstream `429 Too Many Requests` is mapped to `quota_exceeded` with a link to the customer dashboard ("View your usage and upgrade your plan at https://addonnordic.com/dashboard"). Upstream `401`/`403` is mapped similarly with a regeneration link. Replaces generic "server error" / "internal_error" surfaces.
- **`401`/`403` responses are no longer retried against fallback mirrors** — a bad key won't become valid on the second host, and retrying wastes the customer's budget on what is fundamentally a client error.

## [1.2.3] — 2026-05-21

### Added
- **`title` field on all 7 tool annotations** — required by the Anthropic Connectors Directory submission checklist ("Every tool must include a title and the applicable hint"). Titles are human-readable: "Look Up Company", "Validate VAT Number", "Screen Sanctions and PEP Lists", "Full KYB Report", "Autocomplete Address", "Look Up LEI", "Enriched Company Profile". Surfaces in Claude's tool picker and connector UI.

## [1.2.2] — 2026-05-21

### Fixed
- **`mcpName` casing corrected** to `io.github.Mnymann/nordic-data` (capital `M`). The MCP registry verifies the GitHub namespace case-sensitively against the authenticated user, and the GitHub username is `Mnymann`. Required for successful submission to `registry.modelcontextprotocol.io`.

## [1.2.1] — 2026-05-20

### Added
- **`mcpName` in `package.json`** (`io.github.addonnordic/nordic-data`) — required for listing in the official MCP registry at `registry.modelcontextprotocol.io`.
- **Tool annotations on all 7 tools:** `readOnlyHint: true` (none of our tools mutate state) and `openWorldHint: true` (we call external upstream registries). Surfaces in `tools/list` so AI clients can make informed decisions about parallelization, retries, and approval prompts.

## [1.2.0] — 2026-05-20

### Changed
- **Failover logic now retries on `404 Not Found` when multiple hosts are configured as mirrors.** Previously only `5xx` and `429` triggered failover. When the primary upstream is stale or out-of-sync with the fallback (e.g. mid-deploy), a 404 on one mirror would surface as a hard "not found" even though the other mirror had the data. Mirrors should agree on existence; if they disagree, we now try both. Costs one extra round-trip on genuine misses — eliminates false negatives during deploy lag.
- Single-host mode (`NORDIC_API_BASE_URL` set alone) keeps the original behavior — no retry on 404 when there is no second host to try.

## [1.1.0] — 2026-05-20

### Removed
- **Netherlands (`nl`) and Belgium (`be`) removed from company-data tools** (`lookup_company`, `kyb_full`, `company_enriched`, `autocomplete_address`). Benelux coverage now lives in a separate package, `benelux-data-mcp`, because NL KvK lookups carry per-request costs upstream.

### Unchanged
- `validate_vat` still supports NL and BE (VIES is free upstream).
- `screen_sanctions` and `lookup_lei` remain global — no change.

### Migration
- Code that called `lookup_company({ country: "nl", ... })` or `lookup_company({ country: "be", ... })` will now receive a Zod validation error. Switch those calls to `benelux-data-mcp` when available.

## [1.0.0] — 2026-05-XX

### Added
- Initial public release on NPM.
- 7 MCP tools: `lookup_company`, `validate_vat`, `screen_sanctions`, `kyb_full`, `autocomplete_address`, `lookup_lei`, `company_enriched`.
- 14 country coverage across company-data tools (DK, NO, SE, FI, NL, BE, IE, UK, FR, DE, CZ, PL, LV, EE).
- Two transports: stdio (`src/index.ts`) and Streamable HTTP (`src/http.ts`).
- Automatic failover between mirrored upstream hosts on 5xx, 429, and network errors.
- Built-in `X-API-Key` header authentication.
- Example configs for Claude Desktop, Cursor, and Claude Code in `examples/`.
