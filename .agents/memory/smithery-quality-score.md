---
name: Smithery quality score (remote/self-hosted MCP servers)
description: What actually moves the Smithery quality score for a remote/self-hosted MCP server, and what doesn't.
---

For a **remote/self-hosted** MCP server (Smithery only *inspects* the live endpoint, it does not build from the repo), the quality score is computed from live MCP introspection + server metadata — NOT from repo files.

What does NOT move the score:
- **Empty `resources/list` / `prompts/list`** — silences the `-32601 "Method not found"` inspector warnings but earns ZERO quality points. Smithery scores REAL prompts/resources, not declared-but-empty capabilities.
- **Repo-root `icon.svg`** — that convention is for Smithery-*built* TypeScript servers. For a remote server (`startCommand` type `http`) it did not change the score.

What DOES earn points (the three pillars the official docs name for remote servers): comprehensive **descriptions** (server + per-tool), a server **"system prompt"** = the MCP `instructions` field returned in `initialize`, and **package metadata** (keywords/homepage/repository/license). Plus REAL prompts and REAL resources detectable over the connection.

**Why:** three score-targeted changes (empty resources/prompts handlers, then adding `icon.svg`) all left the score stuck at exactly 79; the official Smithery docs describe descriptions / system-prompts / metadata + real discovery content as the scored dimensions.

**How to apply:** to raise the score, add real prompts + resources + an `instructions` string and redeploy the **live endpoint** (this project: push from Replit → Railway auto-deploys → Smithery re-inspects). The score depends on the live endpoint only, so for the score *just the Railway deploy matters*; NPM + MCP-registry republish are for distribution, not the score.

Note: the server is NOT findable in Smithery's public registry API under `io.github.Mnymann/nordic-data`, `Mnymann/nordic-data`, or `@Mnymann/nordic-data` ("Server not found") — the score is shown on Smithery's deployment dashboard, not a public registry listing.
