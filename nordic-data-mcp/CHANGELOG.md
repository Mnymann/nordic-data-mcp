# Changelog

All notable changes to `nordic-data-mcp` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] — 2026-05-23

### Changed
- Version bump only — synchronizes the official MCP Registry (`registry.modelcontextprotocol.io`) entry to the current shipped version. No functional changes from 1.4.0. The previous registry entry was stuck at 1.2.2 because earlier releases were published only to NPM.

## [1.4.0] — 2026-05-23

### Added
- **NL, BE and LU added to all company-data tools** (`lookup_company`, `kyb_full`, `autocomplete_address`, `company_enriched`, `lookup_lei` reverse mode). Brings the supported country set from 12 to 15. BE uses the free public KBO register; LU uses the free RCSL register; NL uses the paid KvK register.
- **Tier-gating documentation in tool descriptions.** All five country-aware tools now disclose that NL and DE require a Starter+ subscription, that free-tier API keys receive HTTP 402 `upgrade_required`, and that agents must NOT retry on 402 — they should surface the upgrade URL to the user instead. Tools also document the per-country cost multipliers (NL=5x, DE=3x, all others=1x) so agents can budget calls.

### Changed
- `lookup_company` `id` parameter description now covers NL (KvK), BE (BCE/KBO) and LU (RCSL) identifier formats.
- README and project metadata updated: removed references to a separate `benelux-data-mcp` package (NL/BE/LU are now first-class here; backend tier-gating handles the commercial split).

### Migration note
- This is technically additive (no existing call shape changes), but if your code relied on receiving a Zod validation error for `country: "nl"`, `"be"` or `"lu"` inputs, you will now see backend HTTP 402 (for NL on free tier) or successful responses (BE, LU, or paid-tier NL) instead.

## [1.3.6] — 2026-05-23

### Added
- **`defaultCountry` per-request option** is now actually honored. When the Smithery gateway (or any HTTP caller) sends `x-default-country: dk` or `?defaultCountry=dk`, and the agent invokes `lookup_company` / `kyb_full` / `autocomplete_address` / `company_enriched` / `lookup_lei` without a `country` argument, the dispatcher injects the default before Zod validation. `validate_vat` is intentionally exempt (it uses a different country list).
- **`verboseErrors` per-request option** is now actually honored. When set via `x-verbose-errors: true` or `?verboseErrors=true`, tool errors include an additional structured JSON block with `status`, `code`, upstream `source`, and parsed error `details` — useful for CI integrations and debugger UIs.
- For stdio mode (Claude Desktop, Cursor, Claude Code) the same options are read from env vars `NORDIC_DEFAULT_COUNTRY` and `NORDIC_VERBOSE_ERRORS`.

### Changed
- Refactored the `CallTool` dispatcher into a shared `dispatchToolCall` helper (`src/lib/dispatcher.ts`) used by both the stdio (`src/index.ts`) and HTTP (`src/http.ts`) entrypoints. Eliminates the previous duplication and is where per-request country injection and verbose-error formatting live.

## [1.3.5] — 2026-05-23

### Added
- **`outputSchema` for all 7 tools.** Each tool now ships a JSON Schema describing the structured response (`lookup_company` → company object with `name`/`address`/`status`/...; `screen_sanctions` → `results[].matches[]` with score and datasets; `kyb_full` → composite identity/persons/financials/lei/vat/sanctions/risk_score; etc.). Surfaced via `tools/list` to MCP clients and registries so agents and tooling (Smithery quality score, MCP Inspector) understand the response shape without a sample call. Schemas use `additionalProperties: true` because the upstream Nordic Data API may add fields without notice.

## [1.3.4] — 2026-05-23

### Fixed
- **`/mcp/auth` now also allows unauthenticated `tools/list`, `resources/list`, and `prompts/list`** so MCP registry scanners (Smithery, MCP Inspector, etc.) can populate the listing's tool-card preview before a user installs the server. These methods return only static metadata — tool names, descriptions, input JSON Schemas — and trigger zero upstream Nordic Data API calls. All paying operations live in `tools/call`, which continues to require a valid `ndk_...` key. Without this fix, Smithery's scan completed the initial handshake (added in 1.3.3) but then failed on `tools/list` with 401, leaving the listing with no tool cards and an "Authorization required" warning.

## [1.3.3] — 2026-05-23

### Fixed
- **`/mcp/auth` now allows unauthenticated `initialize`, `ping`, and `notifications/initialized` requests** so MCP discovery clients (Smithery's gateway scanner, MCP Inspector, Claude.ai connector pre-flight) can confirm the server is alive and learn its identity before prompting the user for an API key. Previously these methods returned 401, which Smithery's scanner interpreted as "OAuth required" and trapped the user in a sign-in popup that could never complete. All other methods — `tools/list`, `tools/call`, batched requests — continue to require a valid `ndk_...` key. The allow-list is purely server-identity metadata: no upstream Nordic Data API calls and no PII are reachable through it.

## [1.3.2] — 2026-05-23

### Fixed
- **Removed `WWW-Authenticate: Bearer realm="nordic-data-mcp"` header from `/mcp/auth` 401 responses.** Per the MCP authorization spec (revision 2025-06-18 and later), a spec-compliant client receiving that header interprets it as an OAuth 2.1 challenge and begins discovery at `/.well-known/oauth-protected-resource`, expecting authorization-server metadata, dynamic client registration, and a browser-based PKCE flow. We use static API-key auth, not OAuth — so advertising a Bearer realm caused the Smithery.ai gateway to hang on an empty "Waiting for Sign In" popup it could never satisfy. A plain 401 with the existing JSON-RPC error body is the correct signal for "your key is missing or malformed — fix it and retry". Required for the Smithery.ai scan/listing flow to complete.

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
