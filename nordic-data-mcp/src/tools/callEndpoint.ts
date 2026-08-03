import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callEndpoint as performCall } from "../lib/specClient.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  method: z
    .string()
    .min(1)
    .default("GET")
    .describe(
      "HTTP method to use. Read-only methods only: GET or HEAD, plus POST solely for the allowlisted screening query endpoints (/api/sanctions/screen, /api/adverse/screen, /api/peps/nl/screen). Defaults to GET.",
    ),
  path: z
    .string()
    .min(1)
    .describe(
      "Concrete endpoint path, e.g. '/api/company/dk/22756214'. Path templates with {placeholders} are also accepted when you supply the values in `params`.",
    ),
  params: z
    .record(z.unknown())
    .optional()
    .describe(
      "Parameters for the call. Values whose keys match {placeholders} in the path are substituted into the path. Remaining values become query-string params for GET/DELETE, or the JSON request body for POST/PUT/PATCH.",
    ),
});

export const callEndpoint: McpTool = {
  name: "call_endpoint",
  description:
    "Discovery meta-tool. Executes a read-only HTTP request against the Nordic Data API for any data endpoint discovered via list_endpoints, and returns the response. Authenticates with the same scoped API key as the curated tools. Strictly read-only: only GET/HEAD requests are permitted, plus POST to three allowlisted screening endpoints (/api/sanctions/screen, /api/adverse/screen, /api/peps/nl/screen) that are pure queries using POST only to carry a large request body. All state-changing operations (watch lists, webhooks, DELETE/PUT/PATCH) and all /admin endpoints are refused. Use list_endpoints and get_endpoint_schema first to find the correct path, method, and parameters.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: {
    title: "Call API Endpoint",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (args) => {
    const { method, path, params } = inputSchema.parse(args);
    return performCall({ method, path, params });
  },
};
