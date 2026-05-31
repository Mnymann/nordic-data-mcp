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
      "HTTP method to use, e.g. GET or POST. Must be a method the endpoint actually supports (see get_endpoint_schema). Defaults to GET.",
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
    "Discovery meta-tool. Executes a real HTTP request against the Nordic Data API for any non-admin endpoint discovered via list_endpoints, and returns the response. Authenticates with the same scoped API key as the curated tools. Only HTTP methods declared in the spec for the given path are permitted; /admin endpoints are always refused. Use list_endpoints and get_endpoint_schema first to find the correct path, method, and parameters.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: {
    title: "Call API Endpoint",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const { method, path, params } = inputSchema.parse(args);
    return performCall({ method, path, params });
  },
};
