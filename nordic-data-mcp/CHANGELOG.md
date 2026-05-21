# Changelog

All notable changes to `nordic-data-mcp` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
