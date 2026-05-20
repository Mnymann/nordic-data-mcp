# Nordic Data MCP Server

[![npm version](https://img.shields.io/npm/v/nordic-data-mcp.svg)](https://www.npmjs.com/package/nordic-data-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents (Claude, Cursor, Claude Code, ChatGPT, Copilot, etc.) direct access to **official European business data** across **14 EU countries** via the [Nordic Data API](https://addonnordic.dk).

Look up companies, validate VAT numbers, run KYB reports, screen against sanctions lists, autocomplete addresses, and resolve LEI ownership — all from inside your AI assistant.

```
DK · NO · SE · FI · NL · BE · IE · UK · FR · DE · CZ · PL · LV · EE
```

---

## Quick start

### 1. Get an API key

Sign up at [addonnordic.dk](https://addonnordic.dk) and grab your `NORDIC_API_KEY`. Free tier available.

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

Or via config file (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "nordic-data": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "nordic-data-mcp"],
      "env": { "NORDIC_API_KEY": "YOUR_KEY_HERE" }
    }
  }
}
```

---

## Available tools

| Tool | What it does |
|---|---|
| `lookup_company` | Basic company data from official registries (CVR, Brønnøysund, Bolagsverket, KVK, Companies House, etc.) |
| `validate_vat` | Validate a VAT number against VIES (EU) or HMRC (GB) |
| `screen_sanctions` | Bulk screen up to 1000 names against UN/EU/OFAC/PEP lists (OpenSanctions, 768K+ entries) |
| `kyb_full` | Master Know-Your-Business report — identity, persons, financials, LEI, VAT, sanctions, adverse media, risk score |
| `autocomplete_address` | Address autocomplete via DAWA (DK), Kartverket (NO), BAN (FR), PDOK (NL), MML (FI), Nominatim (others) |
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
| NL | KVK | 8 digits |
| BE | Enterprise number | 10 digits |
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

## Local development

Requires Node.js 20+.

```bash
git clone https://github.com/Mnymann/nordic-data-mcp.git
cd nordic-data-mcp
npm install
cp .env.example .env   # then edit NORDIC_API_KEY
npm run dev            # stdio transport (for Claude Desktop, Cursor)
npm run dev:http       # Streamable HTTP transport (for remote MCP)
```

To wire your local checkout into Claude Desktop instead of `npx`:

```json
{
  "mcpServers": {
    "nordic-data": {
      "command": "node",
      "args": ["/absolute/path/to/nordic-data-mcp/dist/index.js"],
      "env": { "NORDIC_API_KEY": "YOUR_KEY_HERE" }
    }
  }
}
```

---

## Remote MCP (Streamable HTTP)

For hosted MCP — e.g. Railway, Fly, Anthropic remote connectors — run the HTTP entrypoint:

```bash
npm run build
PORT=3000 NORDIC_API_KEY=... node dist/http.js
```

Endpoints:
- `GET /healthz` — health check (no auth)
- `ALL /mcp` — MCP Streamable HTTP transport. Initial request creates a session; subsequent requests send `Mcp-Session-Id`.

---

## Design notes

- **Thin adapter.** No business logic, no caching, no transformations. Each tool call maps 1:1 to a Nordic Data API endpoint, with `X-API-Key` injected.
- **No PII in logs.** Request and response bodies are never logged.
- **API key is required.** No hardcoded fallback. The process refuses to start without `NORDIC_API_KEY`.
- **Rate limiting** and **caching** are handled by the upstream API.
- Inputs are validated with [zod](https://zod.dev) before any HTTP call.

---

## Roadmap

- [ ] Streaming progress for long-running `kyb_full` calls
- [ ] Optional resource catalog (per-country registry metadata)
- [ ] Optional prompts (KYB workflow templates)
- [ ] Additional country coverage as Nordic Data API expands
- [ ] Submission to Cursor MCP directory and Anthropic remote connectors catalog

---

## Contributing

Issues and PRs welcome at [github.com/Mnymann/nordic-data-mcp](https://github.com/Mnymann/nordic-data-mcp).

Please **do not** include API keys, request bodies, or response payloads in bug reports.

---

## License

MIT © [AddonNordic ApS](https://addonnordic.dk)
