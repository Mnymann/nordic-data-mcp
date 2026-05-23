#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { formatError } from "./lib/errors.js";
import { ensureApiKeyConfigured } from "./lib/apiClient.js";

// stdio mode cannot rely on per-request key overrides — fail fast at startup
// if the operator has not configured NORDIC_API_KEY.
ensureApiKeyConfigured();

const server = new Server(
  { name: "nordic-data-mcp", version: "1.3.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.jsonSchema,
    ...(t.annotations ? { annotations: t.annotations } : {}),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      content: [
        { type: "text", text: `Error: Unknown tool: ${request.params.name}` },
      ],
      isError: true,
    };
  }
  try {
    const result = await tool.handler(request.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${formatError(err)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe — stdout is reserved for the MCP protocol over stdio.
console.error("Nordic Data MCP server running on stdio");
