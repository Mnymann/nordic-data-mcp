import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getSpec, getEndpointSchema as resolveEndpointSchema } from "../lib/specClient.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Endpoint path from list_endpoints, e.g. '/api/company/{country}/{id}'. Concrete paths like '/api/company/dk/22756214' are also accepted.",
    ),
  method: z
    .string()
    .min(1)
    .default("GET")
    .describe(
      "HTTP method for the endpoint (e.g. GET, POST). Defaults to GET. Must be a method the endpoint actually defines.",
    ),
});

export const getEndpointSchema: McpTool = {
  name: "get_endpoint_schema",
  description:
    "Discovery meta-tool. Returns the full parameter and response schema for a single Nordic Data API endpoint (path + method), read from the backend's live OpenAPI spec with $refs resolved inline. Use after list_endpoints to learn exactly which parameters an endpoint takes before calling it with call_endpoint. Admin endpoints are rejected.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: {
    title: "Get Endpoint Schema",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (args) => {
    const { path, method } = inputSchema.parse(args);
    const { spec } = await getSpec();
    return resolveEndpointSchema(spec, path, method);
  },
};
