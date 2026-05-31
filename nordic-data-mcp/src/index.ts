#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { ensureApiKeyConfigured } from "./lib/apiClient.js";
import { dispatchToolCall } from "./lib/dispatcher.js";

// stdio mode cannot rely on per-request key overrides — fail fast at startup
// if the operator has not configured NORDIC_API_KEY.
// Per-request behavior options (NORDIC_DEFAULT_COUNTRY, NORDIC_VERBOSE_ERRORS)
// are read by `dispatchToolCall` via `getRequestOptions()` and need no init.
ensureApiKeyConfigured();

const server = new Server(
  { name: "nordic-data-mcp", version: "1.5.1" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.jsonSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    ...(t.annotations ? { annotations: t.annotations } : {}),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) =>
  dispatchToolCall(request.params.name, request.params.arguments),
);

// Tools-only server: declare resources/prompts capabilities and answer their
// list methods with empty arrays so MCP clients get a clean response, not -32601.
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [],
}));

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe — stdout is reserved for the MCP protocol over stdio.
console.error("Nordic Data MCP server running on stdio");
