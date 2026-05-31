# Memory index

- [Smithery quality score](smithery-quality-score.md) — for a remote/self-hosted MCP server, empty prompts/resources & a repo `icon.svg` earn 0 points; REAL prompts/resources + a server `instructions` string are the lever.
- [Remote MCP auth model](remote-mcp-auth-model.md) — static API-key, NOT OAuth; generic clients hit `POST /register`→fail, so point them at public `/mcp`, header clients at `/mcp/auth`; never advertise OAuth.
