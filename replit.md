# Nordic Data MCP Server

A Model Context Protocol (MCP) server that exposes the Nordic Data API (company, VAT, sanctions, KYB, address, LEI data across 15 EU countries) to AI agents like Claude, Cursor, Claude Code, and ChatGPT. NL+BE+LU were consolidated into this pakke in v1.4.0 — the commercial split (NL KvK costs money) is now handled by the backend's tier-gating (free-tier keys get HTTP 402 on NL/DE; on paid tiers NL costs 5x quota, DE costs 3x). A separate `benelux-data-mcp` package is no longer planned.

The MCP server itself is in **`nordic-data-mcp/`** — a standalone NPM package, separate from the pnpm workspace. The rest of the workspace (`artifacts/api-server`, `lib/*`, `artifacts/mockup-sandbox`) is template scaffolding and is not used by this project.

## Releasing a new version

**Authoritative checklist: `nordic-data-mcp/PUBLISHING.md`** — read it before bumping any version. It documents the 6 failure modes we keep hitting (zsh-comment-in-cd, missing GitHub push, expired npm token, etc.) and the exact command sequence to avoid them.

Per release the agent must:
1. Bump version in **five places**: `package.json`, `VERSION` in `src/http.ts`, Server constructor in `src/index.ts`, `USER_AGENT` in `src/lib/apiClient.ts`, and **`server.json`** (both `.version` AND `.packages[0].version`).
2. Add a CHANGELOG entry.
3. Run `npm run typecheck && npm run build && NORDIC_API_KEY=… scripts/smoke-test-http.sh && NORDIC_API_KEY=… npm run security-check`. (`security-check` is the discovery-tools path-smuggling/admin-bypass regression matrix added in 1.5.0. Note: `smoke-test-http.sh` asserts auth on `tools/call`, NOT `initialize` — `initialize`/`tools/list` are intentionally keyless on `/mcp/auth` for MCP discovery clients.)
4. Commit, then **explicitly tell Martin to push from Replit** (the agent has no GitHub credentials in this environment) before he runs the publish flow on his Mac.
5. Mac runs: `git pull` → `npm install` → `npm run build` → `npm publish` → `mcp-publisher publish` (re-login first if >1 hour since last `mcp-publisher login github` — registry JWT TTL is ~1 hour, much shorter than NPM's ~30 days).
6. Verify all three destinations:
   - NPM: `npm view nordic-data-mcp version`
   - Railway: `curl -s https://nordic-data-mcp-production.up.railway.app/healthz`
   - MCP Registry: `curl 'https://registry.modelcontextprotocol.io/v0/servers?search=Mnymann'` (single-quote URL — zsh treats `?` as glob)

**Current shipped version: 1.4.5** (May 24, 2026). Live on NPM, Railway, and the official MCP Registry (`io.github.Mnymann/nordic-data`). The `mcp-publisher` CLI binary lives at `/Users/martinnymann/mcp-registry/bin/mcp-publisher` on Martin's Mac.

Release history this weekend:
- **1.4.5** (May 24) — **Hotfix.** Removed `outputSchema` from `kyb_full` after v1.4.4 caused Claude Desktop to reject valid responses with "Tool execution failed". Root cause: declared schema (`identity`, `persons`, `risk_score`, …) did not match actual backend shape (`country`, `id`, `companyName`, `risk`, …). Server log confirmed 200 OK responses with full data, but Claude rejected them client-side. Lesson: when the underlying API response shape isn't 1:1 stable, keep documentation in the description and skip `outputSchema` entirely. Other 7 tools keep theirs (their schemas match their backends).
- **1.4.4** (May 24) — `kyb_full` outputSchema documents new partial-response fields: `truncated: boolean` and `sectionsUnavailable: [{section, reason}]`. Backend-coordinated; backend now caps KYB total time at 14s race-cap (was 66s+ cold), so reports complete well under Claude Desktop's 60s MCP-client timeout. Cold cache: Mærsk 20s, LEGO 15.6s, Novo 14.5s on prod (verified). **Superseded by 1.4.5 hotfix** — outputSchema mismatch broke kyb_full in Claude.
- **1.4.3** (May 23) — added `fr_history` tool (French company bitemporal history via INSEE Sirene 3.11). 8 tools total now.
- **1.4.2** (May 23) — full MCP tool annotations on all 7 tools (`destructiveHint: false`, `idempotentHint: true`).

**Name collision noted, decision = ignore.** A competing entry `cloud.nordicdata/nordic-data` exists on the registry (different owner — `sofiajameson20-star`, hosted at `nordicdata.cloud`, 78 tools, claims global B2B intelligence). Martin's decision: our brand is AddonNordic and namespacing `io.github.Mnymann/nordic-data` is distinct enough — focus on distribution instead of escalation.

## Distribution status (May 23, 2026)

All discovery channels submitted. **No further submissions needed in this round** — wait for organic traction:

| Channel | Status | Notes |
|---|---|---|
| NPM | ✅ live `nordic-data-mcp@1.4.2` | `npx -y nordic-data-mcp` works |
| MCP Registry | ✅ live `io.github.Mnymann/nordic-data@1.4.2` | Anthropic's `modelcontextprotocol/servers` README no longer accepts PRs — registry is the canonical replacement |
| Glama.ai | ✅ submitted (auto-indexes from GitHub) | Listing typically appears within hours |
| mcpservers.org | ✅ submitted (was `wong2/awesome-mcp-servers` — moved to form-based submission) | Free tier, review queue |
| punkpeye/awesome-mcp-servers | ✅ PR open | Category: 💰 Finance & Fintech. 87.5k stars |
| TensorBlock/awesome-mcp-servers | ✅ PR open | Category: 📊 Data Analysis & Business Intelligence |
| Cursor forum (Show and Tell) | ✅ posted | https://forum.cursor.com/c/show-and-tell |

**Anthropic `modelcontextprotocol/servers` README PR is intentionally NOT pursued** — maintainers retired the README list in favor of the official MCP Registry, which we are already on.

## Run & Operate (nordic-data-mcp)

All commands are run from `nordic-data-mcp/` and use `npm`, not `pnpm`. The package is intentionally standalone so it can be published to NPM as-is.

- `cd nordic-data-mcp && npm install` — install dependencies
- `npm run build` — compile TypeScript → `dist/`
- `npm run dev` — run stdio MCP server in watch mode
- `npm run dev:http` — run Streamable HTTP MCP server in watch mode (for remote hosting)
- `npm run start:http` — production HTTP server (used by Railway via `railway.toml`)
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

Countries (lowercase, company tools): `dk no se fi ie uk fr de cz pl lv ee nl be lu` (15). NL and DE are tier-gated by backend (Starter+ required); free-tier keys receive HTTP 402 `upgrade_required`. NL=5x, DE=3x cost multiplier, all others 1x.

## User preferences

- **Danish, nocoder-friendly.** Martin is a non-developer. Walk through commands step-by-step in Danish. No jargon unless explained.
- **One command per turn when on Mac.** zsh on macOS does NOT treat `#` as a comment in interactive mode — pasting `cmd # explanation` causes "too many arguments". Never embed comments in commands. Never chain `&&` across more than 2-3 short commands. Send commands one at a time and wait for output.
- **Always verify Martin's working directory** before instructing further `cd` / `git` / `npm` commands. The repo has a nested layout: repo root is `/Users/martinnymann/nordic-data-mcp/`, and the actual package (with `package.json`, `src/`, `dist/`) lives in the inner `/Users/martinnymann/nordic-data-mcp/nordic-data-mcp/`. For `npm` commands always cd into the inner folder; for `git` commands either level works. `smithery.yaml` is an exception — it must sit in the repo root because Smithery.ai only scans the root.
- **NPM token expires roughly every 30 days.** Expect `npm publish` to fail with `E404 / no permission` after a long gap and prompt for `npm login`.

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
