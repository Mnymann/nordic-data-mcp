import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getSpec, listDataEndpoints } from "../lib/specClient.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  search: z
    .string()
    .optional()
    .describe(
      "Optional case-insensitive keyword filter, matched against each endpoint's path, summary, and tags. Examples: 'sanction', 'address', 'cvr', 'history', 'vat', 'lei'. Omit to list every available data endpoint.",
    ),
});

export const listEndpoints: McpTool = {
  name: "list_endpoints",
  description:
    "Discovery meta-tool. Lists ALL available Nordic Data API data endpoints (HTTP method, path, short description) by reading the backend's live OpenAPI spec at runtime — far beyond the curated high-level tools. Use this to discover capabilities the dedicated tools do not cover, then call get_endpoint_schema for parameter details and call_endpoint to execute one. Admin endpoints are never returned. Supports an optional `search` keyword filter. The catalog has 230+ endpoints.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: {
    title: "List API Endpoints",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (args) => {
    const { search } = inputSchema.parse(args);
    const { spec, stale } = await getSpec();
    const endpoints = listDataEndpoints(spec, search);
    return {
      count: endpoints.length,
      ...(search ? { search } : {}),
      ...(stale
        ? {
            warning:
              "Served from last-known-good cache; the live spec was temporarily unavailable.",
          }
        : {}),
      endpoints,
    };
  },
};
