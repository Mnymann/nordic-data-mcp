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
  outputSchema: {
    type: "object",
    additionalProperties: true,
    properties: {
      suggestions: {
        type: "array",
        description: "Ranked address candidates, best match first.",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            text: { type: "string", description: "Formatted address suitable for display." },
            street: { type: "string" },
            house_number: { type: "string" },
            postcode: { type: "string" },
            city: { type: "string" },
            country: { type: "string", description: "ISO 3166-1 alpha-2 code." },
            lat: { type: "number", description: "Latitude (WGS-84)." },
            lon: { type: "number", description: "Longitude (WGS-84)." },
            source: { type: "string", description: "DAWA / Kartverket / BAN / MML / Nominatim." },
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
