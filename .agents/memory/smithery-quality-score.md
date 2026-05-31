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

## Config scoring: "Optional config" (15pt) vs "Config schema" (10pt) are MUTUALLY EXCLUSIVE

The score breakdown has a separate config dimension read from the `configSchema` in **`smithery.yaml` at the repo ROOT** (this one IS read from the repo, unlike tool introspection). Two mutually-exclusive tiers:
- **Optional config = 15pt** — earned ONLY when EVERY config field is optional (no `required:` list) or has a `default`.
- **Config schema = 10pt** — the lesser tier you fall back to if ANY field is required.

So `Config schema OK` + `Optional config Not OK` together = a textbook signal that you have a required field. Fix: remove the field from `required` (keep `pattern`/format validation for when it *is* supplied).

**Why:** stuck at 79 with exactly this breakdown; `smithery.yaml` had `required: [apiKey]`. Removing it flips the 10pt tier → 15pt tier (net ≥+5), crossing 80.

**How to apply:** this is a `smithery.yaml`-only change — NO code, NO version bump, NO NPM/registry republish. Just commit + push the repo and re-inspect on Smithery. Decision (Martin, "model A"): keep `/mcp/auth` per-tenant billing; apiKey is merely *declared* optional in the form (discovery works keyless) but still functionally required to run a lookup — keyless tool calls return a clear "add your API key" error.

Lower-value "Not OK" items deliberately left alone: **Output schemas 7/11** — the 4 missing are `kyb_full` (its outputSchema was removed in 1.4.5 because a shape mismatch made Claude reject responses) + the 3 discovery meta-tools (return arbitrary upstream data, same risk). **Naming** — wants verb-first names; `kyb_full`/`company_enriched`/`fr_history` don't match, but renaming tools is a BREAKING change for existing users, not worth ~4pt.
