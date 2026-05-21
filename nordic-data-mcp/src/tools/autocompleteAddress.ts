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
    "Address autocomplete using each country's authoritative register: DAWA (DK), Kartverket (NO), BAN (FR official), MML (FI), and Nominatim (others). Returns ranked address suggestions with coordinates.",
  inputSchema,
  jsonSchema: zodToJsonSchema(inputSchema) as Record<string, unknown>,
  annotations: { title: "Autocomplete Address", readOnlyHint: true, openWorldHint: true },
  handler: async (args) => {
    const { country, query } = inputSchema.parse(args);
    const qs = new URLSearchParams({ q: query }).toString();
    return apiGet(`/api/address/${country}/autocomplete?${qs}`);
  },
};
