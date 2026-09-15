import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { apiGet } from "../lib/apiClient.js";
import { SUPPORTED_COUNTRIES } from "../lib/countries.js";
import type { McpTool } from "../types.js";

const inputSchema = z.object({
  country: z
    .enum(SUPPORTED_COUNTRIES)
    .describe("ISO 3166-1 alpha-2 country code, lowercase."),
  query: z
    .string()
    .min(2)
    .describe(
      "Partial address — street name, postcode, city, or any combination. Min 2 characters.",
    ),
});

export const autocompleteAddress: McpTool = {
  name: "autocomplete_address",
  description:
    "Address autocomplete using each country's authoritative register: DAWA (DK), Kartverket (NO), BAN (FR official), MML (FI), and Nominatim (others). Returns ranked address suggestions with coordinates. Supports 15 countries (DK, NO, SE, FI, IE, UK, FR, DE, CZ, PL, LV, EE, NL, BE, LU). Tier note: NL and DE require a Starter+ subscription — free-tier API keys receive HTTP 402 'upgrade_required'; do NOT retry on 402.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  // Matches the live response shape (verified 2026-09-15). Every property is
  // nullable: a strict client rejects the whole result if one field breaks
  // the schema.
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      results: {
        type: ["array", "null"],
        description: "Ranked address candidates, best match first.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            displayName: { type: ["string", "null"], description: "Formatted address suitable for display." },
            street: { type: ["string", "null"] },
            number: { type: ["string", "null"], description: "House number." },
            postalCode: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            coordinates: {
              type: ["object", "null"],
              additionalProperties: true,
              description: "WGS-84 {lat, lng}.",
            },
            confidence: { type: ["number", "null"], description: "Match confidence 0-1." },
            source: { type: ["string", "null"], description: "DAWA / Kartverket / BAN / MML / Nominatim." },
          },
        },
      },
    },
  },
  annotations: { title: "Autocomplete Address", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, query } = inputSchema.parse(args);
    const qs = new URLSearchParams({ q: query }).toString();
    return apiGet(`/api/address/${country}/autocomplete?${qs}`);
  },
};
