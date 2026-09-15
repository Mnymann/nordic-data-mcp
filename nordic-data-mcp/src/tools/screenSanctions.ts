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
    "Screen one or more person or company names against UN, EU, OFAC and PEP sanctions lists (768K+ entries via OpenSanctions). Typical use: counterparty checks before onboarding or processing a payment. Returns per-name match lists with fuzzy match scores, source-list attribution and risk topics, plus a 'disclaimer' field. Matches are informational decision-support from public sources, not legal or compliance advice — a match indicates a potential hit that requires verification, not a confirmed listing.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Matches the live response shape (verified 2026-09-15). Every property is
  // nullable (e.g. topScore is null when a name has no hits): a strict client
  // rejects the whole result if one field breaks the schema.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      total: { type: ["integer", "null"], description: "Number of names screened." },
      matched: { type: ["integer", "null"], description: "Number of names with matched=true." },
      results: {
        type: ["array", "null"],
        description: "One entry per input name, in submission order.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            query: { type: ["string", "null"], description: "The original input name." },
            matched: { type: ["boolean", "null"], description: "The screening outcome for this name: true only if at least one hit is classified as a match." },
            classification: { type: ["string", "null"], description: "Outcome for this name: none / potential_match / confirmed." },
            requiresManualReview: { type: ["boolean", "null"], description: "True when hits need human verification." },
            flaggedCount: { type: ["integer", "null"], description: "Number of hits classified as a match." },
            count: { type: ["integer", "null"], description: "Number of fuzzy candidates returned, including unflagged low-confidence ones — not a match count." },
            topScore: { type: ["number", "null"], description: "Highest fuzzy score among candidates; null when there are none. A high score alone is not a match — see classification." },
            hits: {
              type: ["array", "null"],
              description: "Fuzzy candidates, each with its own classification ('none' = not flagged).",
              items: {
                type: "object",
                additionalProperties: true,
                properties: {
                  name: { type: ["string", "null"], description: "Listed entity name." },
                  type: { type: ["string", "null"], description: "individual / entity." },
                  source: { type: ["string", "null"], description: "Source list (UN, EU FSF, US OFAC SDN, OpenSanctions PEPs)." },
                  score: { type: ["number", "null"], description: "Fuzzy match score 0-1." },
                  classification: { type: ["string", "null"], description: "none / potential_match / confirmed." },
                  programs: { type: ["array", "null"], items: { type: "string" }, description: "Sanctions programmes." },
                  countries: { type: ["array", "null"], items: { type: "string" } },
                },
              },
            },
          },
        },
      },
      sourcesUnavailable: {
        type: ["array", "null"],
        description: "Lists that could not be checked on this call; non-empty means the screening is incomplete.",
      },
      indexUpdated: { type: ["object", "null"], additionalProperties: true, description: "ISO-8601 last refresh per source list." },
      disclaimer: { type: ["string", "null"] },
    },
  },
  annotations: { title: "Screen Sanctions and PEP Lists", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const parsed = inputSchema.parse(args);
    return apiPost("/api/sanctions/screen", parsed);
  },
};
