#!/usr/bin/env node
/**
 * Streamable HTTP transport for the Nordic Data MCP server.
 *
 * Used for remote MCP hosting (e.g. Railway + Anthropic remote connectors).
 * For local Claude Desktop / Cursor / Claude Code, use src/index.ts (stdio).
 */
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools/index.js";
import { formatError } from "./lib/errors.js";

function buildServer(): Server {
  const server = new Server(
    { name: "nordic-data-mcp", version: "1.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.jsonSchema,
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

  return server;
}

const app = express();
app.use(express.json({ limit: "4mb" }));

// Health endpoint — does not require an MCP session.
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "nordic-data-mcp", version: "1.1.0" });
});

// Sessions are keyed by Mcp-Session-Id header.
const transports = new Map<string, StreamableHTTPServerTransport>();

app.all("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.header("mcp-session-id") ?? undefined;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = buildServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", formatError(err));
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.error(
    `Nordic Data MCP server (HTTP) listening on :${PORT} — POST /mcp`,
  );
});
