# Nordic Data MCP Server

[![npm version](https://img.shields.io/npm/v/nordic-data-mcp.svg)](https://www.npmjs.com/package/nordic-data-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents (Claude, Cursor, Claude Code, ChatGPT, Copilot, etc.) direct access to **official European business data** across **15 EU countries**.

Look up companies, validate VAT numbers, run KYB reports, screen against sanctions lists, autocomplete addresses, and resolve LEI ownership — all from inside your AI assistant.

```
DK · NO · SE · FI · IE · UK · FR · DE · CZ · PL · LV · EE
```

> NL and DE require a Starter+ subscription (free-tier API keys receive HTTP 402 `upgrade_required`). On paid tiers, NL calls cost 5x quota units and DE calls cost 3x; all other countries cost 1x.

---

## Quick start

### 1. Get an API key

Sign up at [addonnordic.com](https://addonnordic.com) and grab your `NORDIC_API_KEY`. Free tier available.

### 2. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "nordic-data": {
      "command": "npx",
      "args": ["-y", "nordic-data-mcp"],
      "env": {
        "NORDIC_API_KEY": "YOUR_KEY_HERE"
      }
    }
  }
}
```

Restart Claude Desktop. You should see "nordic-data" appear in the tools menu.

### 3. Add to Cursor

In Cursor settings → MCP → Add new server, or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nordic-data": {
      "command": "npx",
      "args": ["-y", "nordic-data-mcp"],
      "env": {
        "NORDIC_API_KEY": "YOUR_KEY_HERE"
      }
    }
  }
}
```

### 4. Add to Claude Code

```bash
claude mcp add nordic-data --env NORDIC_API_KEY=YOUR_KEY_HERE -- npx -y nordic-data-mcp
```

### 5. Add to ChatGPT (Pro, Business, or Enterprise)

ChatGPT supports remote MCP servers as **custom connectors**. No API key needed from you — the hosted server handles upstream authentication.

1. ChatGPT → **Settings** → **Connectors** → **Add custom connector**
2. URL: `https://nordic-data-mcp-production.up.railway.app/mcp`
3. Done — all 7 tools are available immediately.

> Custom connectors require a ChatGPT Pro, Business, Team, or Enterprise plan.

### 6. Add to Claude.ai (web)

Same hosted endpoint, no local install:

1. Claude.ai → **Settings** → **Connectors** → **Add custom connector**
2. URL: `https://nordic-data-mcp-production.up.railway.app/mcp`
3. Done.

---

## Available tools

| Tool | What it does |
|---|---|
| `lookup_company` | Basic company data from official registries (CVR, Brønnøysund, Bolagsverket, Companies House, INSEE, etc.) |
| `validate_vat` | Validate a VAT number against VIES (EU) or HMRC (GB) |
| `screen_sanctions` | Bulk screen up to 1000 names against UN/EU/OFAC/PEP lists (OpenSanctions, 768K+ entries) |
| `kyb_full` | Master Know-Your-Business report — identity, persons, financials, LEI, VAT, sanctions, adverse media, risk score |
| `autocomplete_address` | Address autocomplete via DAWA (DK), Kartverket (NO), BAN (FR), MML (FI), Nominatim (others) |
| `lookup_lei` | GLEIF Legal Entity Identifier lookup — forward, reverse, and parent/children relationships |
| `company_enriched` | Company data + geocoded address + industry stats + Wikidata (website, employees, CEO, ticker, logo) |

### Example agent prompts

> "Look up CVR 61056416 in Denmark"
> → calls `lookup_company { country: "dk", id: "61056416" }` → Carlsberg A/S

> "Run a full KYB report on Equinor (NO 923609016)"
> → calls `kyb_full { country: "no", id: "923609016" }`

> "Is `LU26375245` a valid VAT number?"
> → calls `validate_vat { country: "LU", vat_number: "26375245" }`

> "Screen these names against sanctions: Vladimir Putin, Acme Corp, John Smith"
> → calls `screen_sanctions { names: [...] }`

> "Find the LEI for Tesco UK (00445790) and include parent and subsidiaries"
> → calls `lookup_lei { mode: "reverse", country: "uk", id: "00445790" }`

---

## Country / ID format reference

| Country | ID type | Format |
|---|---|---|
| DK | CVR | 8 digits |
| NO | Organisasjonsnummer | 9 digits |
| SE | Organisationsnummer | 10 digits (with or without dash) |
| FI | Y-tunnus | `NNNNNNN-D` (7 digits + check digit) |
| IE | CRO number | 1–7 digits |
| UK | Companies House | 8 chars (digits, or prefix like `SC`, `NI`, `OC`) |
| FR | SIREN | 9 digits |
| DE | LEI or HRB | LEI = 20 alphanum; HRB = prefix + digits |
| CZ | IČO | 8 digits |
| PL | NIP / REGON / KRS | NIP=10, REGON=9/14, KRS=10 |
| LV | Reģistrācijas nr. | 11 digits |
| EE | Registrikood | 8 digits |

For `validate_vat`, country codes are **uppercase** and cover the broader EU plus GB (use `GB`, not `UK` — HMRC requires GB).

---

## Configuration

The only environment variable you need to set is:

| Variable | Required | Description |
|---|---|---|
| `NORDIC_API_KEY` | yes | Your API key from [addonnordic.com](https://addonnordic.com) |

That's it. The MCP server connects to the hosted Nordic Data API for you.

---

## Self-hosting (remote HTTP transport)

For remote MCP hosting (e.g. Anthropic Connectors, Smithery, web-based clients), deploy the bundled Streamable HTTP transport:

```bash
npm install
npm run build
NORDIC_API_KEY=sk_... npm run start:http   # listens on :$PORT (default 3000)
```

Endpoints:
- `GET /healthz` — health check (returns version + status)
- `ALL /mcp` — MCP Streamable HTTP endpoint (session-based via `Mcp-Session-Id` header)

A `railway.toml` is included for one-click deploy on [Railway](https://railway.app):
1. New Project → Deploy from GitHub repo → select `Mnymann/nordic-data-mcp`
2. Set **Root Directory** to `nordic-data-mcp`
3. Add env var `NORDIC_API_KEY`
4. Railway auto-detects the config, builds, and exposes a public HTTPS URL

---

## Design notes

- **Thin adapter.** No business logic, no caching, no transformations. Each tool maps 1:1 to a Nordic Data API endpoint.
- **No PII in logs.** Request and response bodies are never logged.
- **API key required.** The process refuses to start without `NORDIC_API_KEY`.
- **Rate limiting** and **caching** are handled upstream.
- Inputs are validated with [zod](https://zod.dev) before any HTTP call.

---

## Contributing

Issues and PRs welcome at [github.com/Mnymann/nordic-data-mcp](https://github.com/Mnymann/nordic-data-mcp).

Please **do not** include API keys, request bodies, or response payloads in bug reports.

---

## License

MIT © [AddonNordic ApS](https://addonnordic.com)
