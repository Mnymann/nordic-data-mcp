import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiPost } from "../lib/apiClient.js";
import type { McpTool } from "../types.js";

const entityType = z
  .enum(["company", "person", "auto"])
  .describe(
    "What the screened party is. 'company': a hit on a listed individual is never 'confirmed' (a company is not a natural person). 'person': a hit on a listed entity is never 'confirmed'. 'auto' (default): a legal form in the name (A/S, Ltd, GmbH, AB, Oy …) marks it as a company.",
  );
const birthYear = z
  .number()
  .int()
  .min(1850)
  .max(2100)
  .describe(
    "Birth year of the screened person, if known. When the listed person's birth year is known and differs, the hit is never 'confirmed' (same name, different person).",
  );

const inputSchema = z.object({
  names: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          name: z.string().min(1),
          entity_type: entityType.optional(),
          birth_year: birthYear.optional(),
        }),
      ]),
    )
    .min(1)
    .max(1000)
    .describe(
      "Names to screen, max 1000 per call. Each item is a plain name, or { name, entity_type, birth_year } to say per name whether it is a company or a person (e.g. a company plus its key persons in one call).",
    ),
  entity_type: entityType
    .optional()
    .describe(
      "Default entity type for all names that do not set their own: 'company', 'person' or 'auto' (default). Set 'company' when screening a company name — a hit on a listed individual is then never 'confirmed'.",
    ),
  birth_year: birthYear
    .optional()
    .describe(
      "Default birth year for all names that do not set their own. Only meaningful when screening one person.",
    ),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Minimum fuzzy score for a candidate to be returned, 0-1. Default 0.85. Lower values return more low-confidence candidates; only candidates ≥ 0.95 can ever be classified as a match.",
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
            queryEntityType: { type: ["string", "null"], description: "How the name was treated: company / person / unknown (from entity_type, or a legal form in the name)." },
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
    const p = inputSchema.parse(args);
    // The API speaks camelCase; the tool keeps the snake_case style of its
    // other arguments. (min_score was previously sent as-is and ignored.)
    const body: Record<string, unknown> = {
      names: p.names.map((n) =>
        typeof n === "string"
          ? n
          : {
              name: n.name,
              ...(n.entity_type && { entityType: n.entity_type }),
              ...(n.birth_year !== undefined && { birthYear: n.birth_year }),
            },
      ),
    };
    if (p.entity_type) body.entityType = p.entity_type;
    if (p.birth_year !== undefined) body.birthYear = p.birth_year;
    if (p.min_score !== undefined) body.minScore = p.min_score;
    if (p.fuzzy !== undefined) body.fuzzy = p.fuzzy;
    return apiPost("/api/sanctions/screen", body);
  },
};
