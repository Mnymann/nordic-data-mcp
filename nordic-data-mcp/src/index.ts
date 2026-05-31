#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { ensureApiKeyConfigured } from "./lib/apiClient.js";
import { dispatchToolCall } from "./lib/dispatcher.js";
import { INSTRUCTIONS } from "./lib/instructions.js";
import { listResources, readResource } from "./resources/index.js";
import { listPrompts, getPrompt } from "./prompts/index.js";

// stdio mode cannot rely on per-request key overrides — fail fast at startup
// if the operator has not configured NORDIC_API_KEY.
// Per-request behavior options (NORDIC_DEFAULT_COUNTRY, NORDIC_VERBOSE_ERRORS)
// are read by `dispatchToolCall` via `getRequestOptions()` and need no init.
ensureApiKeyConfigured();

const server = new Server(
  { name: "nordic-data-mcp", version: "1.5.3" },
  { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: INSTRUCTIONS },
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

// Documentation resources (static, no upstream calls).
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listResources(),
}));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: [],
}));
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const r = readResource(request.params.uri);
  if (!r) throw new Error(`Unknown resource: ${request.params.uri}`);
  return { contents: [r] };
});

// Workflow prompts (static templates).
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: listPrompts(),
}));
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const p = getPrompt(request.params.name, request.params.arguments ?? {});
  if (!p) throw new Error(`Unknown prompt: ${request.params.name}`);
  return p;
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr is safe — stdout is reserved for the MCP protocol over stdio.
console.error("Nordic Data MCP server running on stdio");
