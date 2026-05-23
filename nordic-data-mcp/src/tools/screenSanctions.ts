import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiPost } from "../lib/apiClient.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  names: z
    .array(z.string().min(1))
    .min(1)
    .max(1000)
    .describe(
      "Array of person or company names to screen. Max 1000 names per call.",
    ),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .optional()
    .describe(
      "Minimum fuzzy match score, 0-1. Default 0.7. Lower values return more (lower-confidence) matches.",
    ),
  fuzzy: z
    .boolean()
    .default(true)
    .optional()
    .describe("Enable fuzzy matching. Default true."),
});

export const screenSanctions: McpTool = {
  name: "screen_sanctions",
  description:
    "Screen one or more names against UN, EU, OFAC and PEP sanctions lists (768K+ entries via OpenSanctions). Returns match scores with source attribution.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      results: {
        type: "array",
        description: "One entry per input name, in submission order.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            query: { type: "string", description: "The original input name." },
            matches: {
              type: "array",
              description: "Matched sanctioned / PEP entities, ranked by score descending.",
              items: {
                type: "object",
                additionalProperties: true,
                properties: {
                  score: { type: "number", description: "Fuzzy match score 0-1." },
                  name: { type: "string", description: "Matched entity name." },
                  schema: { type: "string", description: "OpenSanctions schema, e.g. Person, Company." },
                  datasets: {
                    type: "array",
                    items: { type: "string" },
                    description: "Source lists (UN, EU, OFAC, PEP, ...).",
                  },
                  topics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Risk topics tagged on the entity.",
                  },
                },
              },
            },
          },
        },
      },
      checked_at: { type: "string", description: "ISO-8601 timestamp of the screening." },
    },
  },
  annotations: { title: "Screen Sanctions and PEP Lists", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const parsed = inputSchema.parse(args);
    return apiPost("/api/sanctions/screen", parsed);
  },
};
