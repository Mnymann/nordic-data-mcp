# Memory index

- [Smithery quality score](smithery-quality-score.md) — for a remote/self-hosted MCP server, empty prompts/resources & a repo `icon.svg` earn 0 points; REAL prompts/resources + a server `instructions` string are the lever.
- [Non-advice disclaimer](non-advice-disclaimer.md) — KYB/sanctions/risk outputs must read as decision-support/guidance, never legal advice; framing must live on instructions + tool descriptions + prompt metadata & body + resources + README.
- [Remote MCP auth model](remote-mcp-auth-model.md) — static API-key, NOT OAuth; generic clients hit `POST /register`→fail, so point them at public `/mcp`, header clients at `/mcp/auth`; never advertise OAuth.
