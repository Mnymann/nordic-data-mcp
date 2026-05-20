# Nordic Data MCP Server

A Model Context Protocol (MCP) server that exposes the Nordic Data API (company, VAT, sanctions, KYB, address, LEI data across 12 EU countries) to AI agents like Claude, Cursor, Claude Code, and ChatGPT. NL and BE are intentionally excluded from company-data tools — they live in a separate `benelux-data-mcp` package (commercial split: NL KvK costs money per lookup).

The MCP server itself is in **`nordic-data-mcp/`** — a standalone NPM package, separate from the pnpm workspace. The rest of the workspace (`artifacts/api-server`, `lib/*`, `artifacts/mockup-sandbox`) is template scaffolding and is not used by this project.

## Run & Operate (nordic-data-mcp)

All commands are run from `nordic-data-mcp/` and use `npm`, not `pnpm`. The package is intentionally standalone so it can be published to NPM as-is.

- `cd nordic-data-mcp && npm install` — install dependencies
- `npm run build` — compile TypeScript → `dist/`
- `npm run dev` — run stdio MCP server in watch mode
- `npm run dev:http` — run Streamable HTTP MCP server in watch mode (for remote hosting)
- `npm run typecheck` — type-check without emitting
- `node scripts/smoke-test.mjs` — end-to-end test: initialize → tools/list → tools/call (requires `NORDIC_API_KEY`)
- Required env: `NORDIC_API_KEY` (get one at https://addonnordic.com)
- Internal-only env (NOT documented to end users — failover is automatic and invisible): `NORDIC_API_PRIMARY`, `NORDIC_API_FALLBACK`, `NORDIC_API_BASE_URL` for overriding the baked-in Railway + Render defaults. Only set these if you're rotating infrastructure.
- Optional env: `PORT` (HTTP transport only, default 3000)

## Stack

- Node.js 20+, TypeScript 5.4, ESM
- MCP SDK: `@modelcontextprotocol/sdk` v1
- Transports: stdio (`src/index.ts`) and Streamable HTTP (`src/http.ts` via Express)
- Validation: `zod` + `zod-to-json-schema`
- Distribution: published as NPM package `nordic-data-mcp` — users run `npx -y nordic-data-mcp`

## Where things live

- `nordic-data-mcp/src/index.ts` — stdio entrypoint (Claude Desktop, Cursor, Claude Code)
- `nordic-data-mcp/src/http.ts` — Streamable HTTP entrypoint (Railway / Anthropic remote connectors)
- `nordic-data-mcp/src/tools/` — one file per MCP tool (7 tools total)
- `nordic-data-mcp/src/tools/index.ts` — single source of truth for the tool registry
- `nordic-data-mcp/src/lib/apiClient.ts` — thin `fetch` wrapper with `X-API-Key` header and typed errors
- `nordic-data-mcp/src/lib/countries.ts` — supported country lists (12 lowercase for company tools — NL/BE excluded for Benelux split, broader uppercase set for VAT)
- `nordic-data-mcp/src/lib/errors.ts` — `NordicApiError` + `formatError`
- `nordic-data-mcp/examples/` — ready-to-paste config files for Claude Desktop, Cursor, Claude Code

## Architecture decisions

- **Thin adapter, no business logic.** Each MCP tool maps 1:1 to a Nordic Data API endpoint. No caching, no transformations, no scoring — backend handles all of that.
- **Zod parsing happens inside each handler**, not in the central dispatcher. Keeps the `McpTool` type non-generic and simple (handlers accept `unknown`), and makes each tool self-contained for testing.
- **stdout is reserved for the MCP protocol.** All logging goes to stderr (`console.error`) — `console.log` would corrupt the JSON-RPC stream in stdio mode.
- **No PII in logs.** Request bodies and response payloads are never logged. Errors are formatted as `[status] code — message` only.
- **HTTP transport is session-based** via `Mcp-Session-Id` header, one `Server` instance per session, cleaned up on transport close.
- **API key is required at boot** — no hardcoded fallback. The process refuses to start without `NORDIC_API_KEY`.

## Product

7 MCP tools exposed to AI agents:

1. `lookup_company` — basic company data from official registries (12 countries)
2. `validate_vat` — VIES (EU) + HMRC (GB) VAT validation
3. `screen_sanctions` — bulk screen up to 1000 names against UN/EU/OFAC/PEP (OpenSanctions)
4. `kyb_full` — master KYB report (identity + persons + financials + LEI + VAT + sanctions + adverse media + risk score)
5. `autocomplete_address` — authoritative address autocomplete per country (DAWA, Kartverket, BAN, MML, Nominatim)
6. `lookup_lei` — GLEIF forward + reverse + parent/children
7. `company_enriched` — registry + geocoded address + industry stats + Wikidata

Countries (lowercase, company tools): `dk no se fi ie uk fr de cz pl lv ee` (12). NL/BE go to `benelux-data-mcp`.

## User preferences

_None recorded yet._

## Gotchas

- **Use `GB`, not `UK`, for `validate_vat`** — HMRC requires the GB code. The 12 company-data countries use `uk` (lowercase) but VAT uses uppercase + `GB`.
- **Don't use `console.log` in `src/index.ts`** — stdout is the MCP transport. Use `console.error` (which goes to stderr).
- **The package is NOT part of the pnpm workspace.** Don't add `nordic-data-mcp` to `pnpm-workspace.yaml`. Use npm inside the folder.
- **`npm install` in `nordic-data-mcp/`** — running it from the repo root will trigger the workspace `preinstall` hook that rejects npm.
- The Nordic Data API may report individual countries as `error` or `unconfigured` in `/api/health`; this is upstream behavior and surfaces to MCP tools as `502 upstream_unavailable`.

## Pointers

- Build brief: `attached_assets/MCP_Build_Brief_1779279857443.md`
- Package README (publish-facing): `nordic-data-mcp/README.md`
- MCP spec: https://modelcontextprotocol.io
